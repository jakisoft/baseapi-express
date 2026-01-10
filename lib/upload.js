const axios = require("axios");
const FormData = require("form-data");

async function uploadFile(buffer, filename) {
  const formData = new FormData();
  formData.append("file", buffer, filename);

  const response = await axios.post(
    "https://jakysoft.xyz/api/upload",
    formData,
    {
      headers: formData.getHeaders(),
    }
  );

  return response.data;
}

module.exports = uploadFile
