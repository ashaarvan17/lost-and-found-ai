
const multer = require("multer");

const storage = multer.memoryStorage();

const fileFilter = (req, file, callback) => {
    const allowedTypes = [
        "image/jpeg",
        "image/png",
        "image/webp"
    ];

    if (allowedTypes.includes(file.mimetype)) {
        callback(null, true);
    } else {
        callback(new multer.MulterError("LIMIT_UNEXPECTED_FILE", file.fieldname));
    }
};

const upload = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: 5 * 1024 * 1024,
        fieldSize: 128 * 1024,
        fields: 20,
        files: 1,
        parts: 21
    }
});

module.exports = upload;
