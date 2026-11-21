const dns = require("node:dns");

// The explicit development launcher only: Windows can resolve Atlas SRV
// records through its system resolver while Node's default resolver times out.
dns.setServers(["8.8.8.8", "8.8.4.4"]);

process.env.NODE_ENV = "development";
require("../server");
