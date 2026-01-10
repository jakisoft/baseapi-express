const express = require("express")
const axios = require("axios")
const uploadFile = require("../lib/upload.js")
const crypto = require("crypto")

const router = express.Router()

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

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

router.get("/youtube/mp3", async (req, res) => {
  try {
    const { url } = req.query
    if (!url) {
      return res.status(400).json({
        success: false,
        message: "Query url wajib diisi"
      })
    }

    const initRes = await axios.get(
      "https://p.savenow.to/ajax/download.php",
      {
        params: {
          copyright: 0,
          format: "mp3",
          url,
          api: "dfcb6d76f2f6a9894gjkege8a4ab232222"
        },
        timeout: 20000,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36",
          Referer: "https://savenow.to/"
        }
      }
    )

    const initData = initRes.data
    if (!initData?.success || !initData.id) {
      return res.status(500).json({
        success: false,
        message: "Gagal memulai konversi YouTube MP3"
      })
    }

    const taskId = initData.id
    let downloadUrl = null
    let attempt = 0
    const maxAttempt = 30

    while (attempt < maxAttempt) {
      const progressRes = await axios.get(
        "https://p.savenow.to/api/progress",
        {
          params: { id: taskId },
          timeout: 15000
        }
      )

      const progressData = progressRes.data

      if (progressData?.success && progressData.download_url) {
        downloadUrl = progressData.download_url
        break
      }

      attempt++
      await sleep(2000)
    }

    if (!downloadUrl) {
      return res.status(504).json({
        success: false,
        message: "Timeout menunggu proses konversi MP3"
      })
    }

    const mp3Res = await axios.get(downloadUrl, {
      responseType: "arraybuffer",
      timeout: 60000
    })

    const filename = makeFilename("youtube_mp3")
    const uploaded = await uploadFile(Buffer.from(mp3Res.data), filename)

    res.json({
      success: true,
      title: initData.title || initData.info?.title || "",
      thumbnail: initData.info?.image || null,
      audio: {
        url: uploaded.url
      }
    })
  } catch (err) {
    console.error("YouTube MP3 Error:", err)
    res.status(500).json({
      success: false,
      message: err.response?.data?.message || err.message || "Internal Server Error"
    })
  }
})

module.exports = router
