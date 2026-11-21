try {
  const state = rs.status();
  if (state.ok === 1) {
    print("Replica set is already initialized.");
    quit(0);
  }
} catch (error) {
  // An uninitialized replica set has no status document yet.
}

const result = rs.initiate({
  _id: "rs0",
  members: [{ _id: 0, host: "localhost:27017" }],
});

if (result.ok !== 1) {
  throw new Error("Could not initialize local rs0 replica set.");
}
print("Initialized local rs0 replica set. Wait for localhost:27017 to become primary.");
