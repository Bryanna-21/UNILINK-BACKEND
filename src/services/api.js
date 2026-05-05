import axios from "axios";

const API = axios.create({
  baseURL: "https://YOUR-BACKEND.onrender.com/api"
});

API.interceptors.request.use((req) => {
  const token = localStorage.getItem("token");
  if (token) {
    req.headers.Authorization = token;
  }
  return req;
});

export default API;
