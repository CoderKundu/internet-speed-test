const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

const speedRoutes = require("./routes/speed");

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/speedtest", speedRoutes);

mongoose
  .connect(
    "mongodb://speedtestUser:speedtestmongo123@cluster0-shard-00-00.teagyys.mongodb.net:27017,cluster0-shard-00-01.teagyys.mongodb.net:27017,cluster0-shard-00-02.teagyys.mongodb.net:27017/speedtest?ssl=true&replicaSet=atlas-xxxxx-shard-0&authSource=admin&retryWrites=true&w=majority"
  )
  .then(() => console.log("✅ MongoDB Atlas connected"))
  .catch((err) => console.error("❌ MongoDB error:", err));

const PORT = 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

