"use strict";

const BbPromise = require("bluebird"),
	_ = require("lodash");

const mappings = require("./mappings");

function listExports(AWS, exports, nextToken) {
	exports = exports || [];
	return AWS.request("CloudFormation", "listExports", { NextToken: nextToken })
		.tap(response => {
			exports.push.apply(exports, response.Exports);
			if (response.NextToken) {
				// Query next page
				return listExports(AWS, exports, response.NextToken);
			}
		})
		.return(exports);
}

function listStackResources(AWS, resources, nextToken) {
	resources = resources || [];
	return AWS.request("CloudFormation", "listStackResources", {
		StackName: AWS.naming.getStackName(),
		NextToken: nextToken
	})
		.then(response => {
			resources.push.apply(resources, response.StackResourceSummaries);
			if (response.NextToken) {
				// Query next page
				return listStackResources(AWS, resources, response.NextToken);
			}
		})
		.return(resources);
}

function resolveAttribute(AWS, resource, attributeName) {
	let service = resource.ResourceType.split("::")[1];
	let mapping = mappings[service](resource);

	return AWS.request(service, mapping.fn, mapping.params).then(response => {
		const attrPath =
			mapping.attributes && mapping.attributes[attributeName]
				? mapping.attributes[attributeName]
				: attributeName;
		const returnPath = mapping.returnPath
			? `${mapping.returnPath}.${attrPath}`
			: attrPath;
		console.log(response);

		const attributeValue = _.get(response, returnPath);
		return attributeValue;
	});
}

/**
 * Resolves CloudFormation references and import variables
 *
 * @param {Serverless} serverless - Serverless Instance
 * @param {Object[]} envVars - Environment Variables
 * @returns {Promise<String[]>} Resolves with the list of environment variables
 */
function resolveCloudFormationenvVars(serverless, envVars) {
	const AWS = serverless.providers.aws;
	return BbPromise.join(listStackResources(AWS), listExports(AWS)).spread(
		(resources, exports) => {
			function mapValue(value) {
				if (_.isObject(value)) {
					if (value.Ref) {
						if (value.Ref === "AWS::Region") {
							return AWS.getRegion();
						} else if (value.Ref === "AWS::AccountId") {
							return AWS.getAccountId();
						} else if (value.Ref === "AWS::StackId") {
							return _.get(_.first(resources), "StackId");
						} else if (value.Ref === "AWS::StackName") {
							return AWS.naming.getStackName();
						} else {
							const resource = _.find(resources, [
								"LogicalResourceId",
								value.Ref
							]);
							const resolved = _.get(resource, "PhysicalResourceId", null);
							if (_.isNil(resolved)) {
								serverless.cli.log(
									`WARNING: Failed to resolve reference ${value.Ref}`
								);
							}
							return BbPromise.resolve(resolved);
						}
					} else if (value["Fn::ImportValue"]) {
						const importKey = value["Fn::ImportValue"];
						const resource = _.find(exports, ["Name", importKey]);
						const resolved = _.get(resource, "Value", null);
						if (_.isNil(resolved)) {
							serverless.cli.log(
								`WARNING: Failed to resolve import value ${importKey}`
							);
						}
						return BbPromise.resolve(resolved);
					} else if (value["Fn::Join"]) {
						// Join has two Arguments. first the delimiter and second the values
						const delimiter = value["Fn::Join"][0];
						const parts = value["Fn::Join"][1];
						return BbPromise.map(parts, v => mapValue(v)).then(resolvedParts =>
							_.join(resolvedParts, delimiter)
						);
					} else if (value["Fn::GetAtt"]) {
						const logicalResourceId = value["Fn::GetAtt"][0];
						const attributeName = value["Fn::GetAtt"][1];

						const resource = _.find(resources, [
							"LogicalResourceId",
							logicalResourceId
						]);

						return resolveAttribute(AWS, resource, attributeName);
					}
				}

				return BbPromise.resolve(value);
			}

			return BbPromise.reduce(
				_.keys(envVars),
				(result, key) => {
					return BbPromise.resolve(mapValue(envVars[key])).then(resolved => {
						console.log(
							`Resolved environment variable ${key}: ${JSON.stringify(
								resolved
							)}`
						);

						process.env.SLS_DEBUG &&
							serverless.cli.log(
								`Resolved environment variable ${key}: ${JSON.stringify(
									resolved
								)}`
							);
						result[key] = resolved;
						return BbPromise.resolve(result);
					});
				},
				{}
			);
		}
	);
}

module.exports = resolveCloudFormationenvVars;
