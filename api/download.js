const express = require("express")
const axios = require("axios")
const uploadFile = require("../lib/upload.js")
const path = require("path")
const crypto = require("crypto")

const router = express.Router()

const makeFilename = (prefix = "facebook", ext = "mp4") => {
  const id = crypto.randomBytes(6).toString("hex")
  return `${prefix}_${Date.now()}_${id}.${ext}`
}

router.get("/facebook", async (req, res) => {
  try {
    const { url } = req.query
    if (!url) {
      return res.status(400).json({ success: false, message: "Query url wajib diisi" })
    }

    const response = await axios.get(
      "https://serverless-tooly-gateway-6n4h522y.ue.gateway.dev/facebook/video",
      {
        params: { url },
        headers: {
          "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36",
          "Referer": "https://chative.io/tools/facebook-video-downloader/"
        }
      }
    )

    const data = response.data
    if (!data.success) {
      return res.status(500).json({ success: false, message: "Gagal mengambil data" })
    }

    const result = {
      success: true,
      title: data.title,
      videos: {}
    }

    if (data.videos?.hd?.url) {
      const filename = makeFilename("facebook_hd")
      const uploaded = await uploadFile(data.videos.hd.url, filename)

      result.videos.hd = {
        size: data.videos.hd.size,
        url: uploaded.url
      }
    }

    if (data.videos?.sd?.url) {
      const filename = makeFilename("facebook_sd")
      const uploaded = await uploadFile(data.videos.sd.url, filename)

      result.videos.sd = {
        size: data.videos.sd.size,
        url: uploaded.url
      }
    }

    res.json(result)
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message || "Internal Server Error"
    })
  }
})

module.exports = router
