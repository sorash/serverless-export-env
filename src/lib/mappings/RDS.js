module.exports = resource => {
	const resourceType = resource.ResourceType;
	const type = resourceType.split("::")[2];

	let mapping;
	switch (type) {
		case "DBCluster":
			mapping = {
				fn: "describeDBClusters",
				params: {
					DBClusterIdentifier: resource.PhysicalResourceId
				},
				returnPath: "DBClusters[0]"
			};
			break;

		case "DBInstance":
			mapping = {
				fn: "describeDBInstances",
				params: {
					DBInstanceIdentifier: resource.PhysicalResourceId
				},
				returnPath: "DBInstances[0]"
			};
			break;

		default:
			break;
	}

	return mapping;
};
