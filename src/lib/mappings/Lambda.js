module.exports = resource => {
	const resourceType = resource.ResourceType;
	const type = resourceType.split("::")[2];

	let mapping;
	switch (type) {
		case "Function":
			mapping = {
				fn: "getFunctionConfiguration",
				params: {
					FunctionName: resource.PhysicalResourceId
				},
				attributes: {
					Arn: "FunctionArn"
				}
			};
			break;

		case "Version":
			mapping = {
				fn: "getFunctionConfiguration",
				params: {
					FunctionName: resource.PhysicalResourceId
				}
			};
			break;

		default:
			break;
	}

	return mapping;
};
