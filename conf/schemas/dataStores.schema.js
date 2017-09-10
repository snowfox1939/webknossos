db.runCommand({
  collMod: "dataStores",
  validator: {
    $and: [
      {
        dataStoreInfo: { $type: "object", $exists: true },
      },
      {
        dataSource: { $type: "object", $exists: true },
      },
      {
        allowedTeams: { $type: "array", $exists: true },
      },
      {
        isActive: { $type: "bool", $exists: true },
      },
      {
        isPublic: { $type: "bool", $exists: true },
      },
      {
        $or: [{ description: { $type: "string" } }, { description: { $exists: false } }],
      },
      {
        $or: [
          { defaultConfiguration: { $type: "object" } },
          { defaultConfiguration: { $exists: false } },
        ],
      },
      {
        created: { $type: "long", $exists: true },
      },
    ],
  },
});
