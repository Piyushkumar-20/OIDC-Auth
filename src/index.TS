import express from "express";
import path from "node:path";

const app = express();
const PORT = process.env ?? 3000;

app.use(express.json());
app.use(express.static(path.resolve("public")));

app.get("/", (req, res) => {
  res.json({ message: "Hello from Auth Server" });
});

app.get("/health", (req, res) => {
  res.json({ message: "Server is Healthy", healthy: true });
});


app.listen(PORT, () => {
    console.log(`AuthServer is running on http://localhost:${PORT}`)
})