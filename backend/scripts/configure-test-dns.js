
const dns = require("node:dns");

const servers = (process.env.MONGODB_TEST_DNS_SERVERS || "")
  .split(",")
  .map((server) => server.trim())
  .filter(Boolean);

if (servers.length > 0) {
  dns.setServers(servers);
}
