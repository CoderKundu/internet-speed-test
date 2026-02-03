const express = require("express");
const { exec } = require("child_process");

const router = express.Router();

router.get("/", (req, res) => {
  exec(
    "speedtest --accept-license --accept-gdpr -f json",
    (error, stdout) => {
      if (error) {
        return res.status(500).json({ error: "Speed test failed" });
      }

      const data = JSON.parse(stdout);

      res.json({
        download: (data.download.bandwidth * 8 / 1e6).toFixed(2),
        upload: (data.upload.bandwidth * 8 / 1e6).toFixed(2),
        ping: data.ping.latency,
        isp: data.isp,
        location: `${data.server.location}, ${data.server.country}`
      });
    }
  );
});

module.exports = router;
