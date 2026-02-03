const mongoose = require("mongoose");

const speedTestSchema = new mongoose.Schema(
  {
    download: {
      type: Number,
      required: true
    },
    upload: {
      type: Number,
      required: true
    },
    ping: {
      type: Number,
      required: true
    },
    location: {
      type: String,
      required: true
    },
    isp: {
      type: String,
      required: true
    }
  },
  {
    timestamps: true // creates createdAt & updatedAt automatically
  }
);

module.exports = mongoose.model("SpeedTest", speedTestSchema);
