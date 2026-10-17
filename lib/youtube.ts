/**
 * Cliente simple para YouTube Data API v3 (server-side).
 * Solo para consultas de lectura seguras (canales/playlist recientes).
 */
export async function getVideosRecientes(playlistId: string) {
  const apiKey = process.env.YOUTUBE_API_KEY
  if (!apiKey) {
    throw new Error('Falta YOUTUBE_API_KEY')
  }

  const url = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${playlistId}&maxResults=10&key=${apiKey}`
  
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`YouTube API error: ${response.statusText}`)
  }
  
  const data = (await response.json()) as {
    items: Array<{
      snippet: {
        resourceId: { videoId: string }
        title: string
        description: string
      }
    }>
  }
  return data.items.map((item) => ({
    video_id: item.snippet.resourceId.videoId,
    titulo: item.snippet.title,
    descripcion: item.snippet.description
  }))
}
