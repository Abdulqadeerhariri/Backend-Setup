import multer from "multer";

const uploadDir = "public/temp";

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir); // folder name
  },
  filename: (req, file, cb) => {
    cb(null, file.originalname)
  }
});

export const upload = multer({ storage });