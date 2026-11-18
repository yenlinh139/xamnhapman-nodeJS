// Nhãn huyện/xã hiển thị trên bản đồ (FE: labelService.js). FE từng gọi thẳng WFS của GeoServer qua
// domain công khai (/m/gsrv/.../ows), nhưng tầng reverse-proxy bên ngoài (ngoài tầm kiểm soát của
// repo này) chỉ proxy đúng path /wms, không proxy /ows -> trả về HTML (index.html) thay vì JSON.
// Backend gọi thẳng GeoServer qua mạng nội bộ Docker (service "geoserver") nên không phụ thuộc
// proxy đó, rồi trả lại cho FE qua /api/.
const axios = require("axios");
const logger = require("../../loggers/loggers.config");

const GEOSERVER_INTERNAL_URL = process.env.GEOSERVER_INTERNAL_URL || "http://geoserver:8080/geoserver";
const GS_WORKSPACE = process.env.GS_WORKSPACE || "xamnhapman_tphcm";

// Ranh huyện/xã gần như không đổi -> cache 10 phút, tránh gọi GeoServer mỗi lần load bản đồ.
const LABELS_CACHE_TTL_MS = 10 * 60 * 1000;
const labelsCache = new Map();

const fetchWfsFeatureCollection = async (typeName) => {
  const response = await axios.get(`${GEOSERVER_INTERNAL_URL}/${GS_WORKSPACE}/ows`, {
    params: {
      service: "WFS",
      version: "1.0.0",
      request: "GetFeature",
      typeName: `${GS_WORKSPACE}:${typeName}`,
      outputFormat: "application/json",
    },
    timeout: 15000,
  });
  return response.data;
};

const createMapLabelsHandler = (typeName) => async (req, reply) => {
  try {
    const cached = labelsCache.get(typeName);
    if (cached && cached.expiresAt > Date.now()) {
      return reply.code(200).send(cached.payload);
    }

    const data = await fetchWfsFeatureCollection(typeName);
    const payload = {code: 200, data};
    labelsCache.set(typeName, {expiresAt: Date.now() + LABELS_CACHE_TTL_MS, payload});
    return reply.code(200).send(payload);
  } catch (error) {
    logger.error(error);
    return reply.code(500).send({code: 500, message: "Lỗi máy chủ"});
  }
};

module.exports = {
  GetDistrictLabels: createMapLabelsHandler("DiaPhanHuyen"),
  GetCommuneLabels: createMapLabelsHandler("DiaPhanXa"),
};
