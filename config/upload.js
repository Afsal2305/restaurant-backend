const multer = require('multer');
const path = require('path');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../uploads'));
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const magicBytes = {
  jpeg: ['ffd8ff'],
  png: ['89504e47'],
  gif: ['47494638'],
  webp: ['52494646'],
  bmp: ['424d'],
  ico: ['00000100'],
  tiff: ['49492a00', '4d4d002a'],
  svg: ['3c737667', '3c3f786d6c']
};

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp|svg|bmp|ico|tiff|tif|avif/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype.split('/')[1]);

    if (!extname || !mimetype) {
      return cb(new Error('Only image files are allowed'));
    }

    file.stream.pause();

    const onReadable = () => {
      const chunk = file.stream.read(8);
      if (!chunk) return;
      file.stream.removeListener('readable', onReadable);

      const hex = chunk.toString('hex').toLowerCase();
      const valid = Object.values(magicBytes).some(prefixes =>
        prefixes.some(p => hex.startsWith(p))
      );

      if (!valid) {
        file.stream.destroy();
        return cb(new Error('File content does not match image format'));
      }

      file.stream.unshift(chunk);
      file.stream.resume();
      cb(null, true);
    };

    file.stream.on('readable', onReadable);
  }
});

module.exports = upload;
