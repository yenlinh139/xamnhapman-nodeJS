const jwt = require("jsonwebtoken");
const logger = require("../loggers/loggers.config");

//function check token is have or not
const VerifyToken = (req, res, next) => {
  try {
    if (req.headers["authorization"] == undefined) {
      res.status(401).send({code: 401, message: "Không có quyền truy cập"});
    }

    const checkBearer = req.headers["authorization"].includes("Bearer");
    if (!checkBearer) {
      res.status(401).send({code: 401, message: "Token không đúng định dạng Bearer"});
    }

    const token = req.headers["authorization"].replace("Bearer ", "");
    if (!token) {
      res.status(401).send({code: 401, message: "Không có quyền truy cập"});
    }

    jwt.verify(token, process.env.ACCESS_TOKEN, (err, decoded) => {
      if (err) {
        res.status(401).send({code: 401, message: "Token đã hết hạn"});
      }
      req.user = decoded;
      next();
    });
  } catch (error) {
    logger.error(error);
    res.status(500);
    res.send({code: 500, message: "Lỗi máy chủ nội bộ"});
  }
};

module.exports = VerifyToken;
// Cách dùng: Muốn verify token ở đâu thì bỏ VerifyToken vào phần route
