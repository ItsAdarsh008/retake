/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["ffmpeg-static", "ffprobe-static"],
  devIndicators: false,
};
export default nextConfig;
