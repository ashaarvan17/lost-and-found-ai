
const path = require("node:path");
const fs = require("node:fs");
const dotenv = require("dotenv");

if (process.env.NODE_ENV === "development") {
    const developmentEnvPath = path.join(__dirname, ".env.development");
    const loaded = dotenv.config({ path: developmentEnvPath, override: true });
    if (loaded.error) {
        console.error("Development configuration is missing. Create backend/.env.development; backend/.env will not be used in development mode.");
        process.exit(1);
    }

    let existingEnvironment;
    try {
        existingEnvironment = dotenv.parse(fs.readFileSync(path.join(__dirname, ".env")));
    } catch {
        console.error("The existing backend/.env could not be read; refusing to start against a different Atlas cluster.");
        process.exit(1);
    }

    const { assertDevelopmentEnvironment } = require("./src/config/developmentEnvironment");
    try {
        assertDevelopmentEnvironment(process.env, existingEnvironment);
    } catch (error) {
        console.error(error.message);
        process.exit(1);
    }
} else {
    dotenv.config();
}

const app = require("./src/app");
const connectDB = require("./src/config/database");
const { assertProductionEnvironment } = require("./src/config/productionEnvironment");

const PORT = process.env.PORT || 4000;

async function startServer() {
    try {
        assertProductionEnvironment();
        await connectDB();

        app.listen(PORT, () => {
            console.log(
                `FindBack AI backend running on port ${PORT}`
            );
        });

    } catch (error) {
        console.error("Failed to start server.");
        process.exit(1);
    }
}

startServer();
