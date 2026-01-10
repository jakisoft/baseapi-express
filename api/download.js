const express = require("express")
const axios = require("axios")
const uploadFile = require("../lib/upload.js")
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
      return res.status(400).json({
        success: false,
        message: "Query url wajib diisi"
      })
    }

    const response = await axios.get(
      "https://serverless-tooly-gateway-6n4h522y.ue.gateway.dev/facebook/video",
      {
        params: { url },
        timeout: 20000,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36",
          Referer: "https://chative.io/tools/facebook-video-downloader/"
        }
      }
    )

    const data = response.data
    if (!data?.success) {
      return res.status(500).json({
        success: false,
        message: "Gagal mengambil data Facebook"
      })
    }

    const result = {
      success: true,
      title: data.title || "",
      videos: {}
    }

    if (data.videos?.hd?.url) {
      const filename = makeFilename("facebook_hd")

      const hdRes = await axios.get(data.videos.hd.url, {
        responseType: "arraybuffer",
        timeout: 30000
      })

      const uploaded = await uploadFile(Buffer.from(hdRes.data), filename)

      result.videos.hd = {
        size: data.videos.hd.size || null,
        url: uploaded.url
      }
    }

    if (data.videos?.sd?.url) {
      const filename = makeFilename("facebook_sd")

      const sdRes = await axios.get(data.videos.sd.url, {
        responseType: "arraybuffer",
        timeout: 30000
      })

      const uploaded = await uploadFile(Buffer.from(sdRes.data), filename)

      result.videos.sd = {
        size: data.videos.sd.size || null,
        url: uploaded.url
      }
    }

    res.json(result)
  } catch (err) {
    console.error("Facebook Error:", err)
    res.status(500).json({
      success: false,
      message: err.response?.data?.message || err.message || "Internal Server Error"
    })
  }
})

module.exports = router
