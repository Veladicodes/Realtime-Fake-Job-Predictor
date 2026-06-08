export interface AnalyzeJobRequestPayload {
  title: string
  description: string
  requirements: string
  company: string
}

export interface AnalyzeJobApiResult {
  job_id?: string
  label?: "FAKE" | "REAL"
  prediction?: "FAKE" | "REAL" | number
  confidence: number
  reason?: string
  explanation?: string[]
  note?: string
  cluster_id?: string
  original_score?: number
  updated_score?: number
  is_corrected?: boolean
  timestamp?: string
}

export async function analyzeJob(data: AnalyzeJobRequestPayload): Promise<AnalyzeJobApiResult> {
  console.log("Sending request to backend...")
  console.log("POST http://127.0.0.1:8000/analyze")

  const response = await fetch("http://127.0.0.1:8000/analyze", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      title: data.title,
      description: data.description,
      requirements: data.requirements,
      company_info: data.company,
      company_profile: data.company,
    }),
  })

  const text = await response.text()

  if (!response.ok) {
    console.error("FULL BACKEND ERROR:", text)
    throw new Error(text)
  }

  return JSON.parse(text) as AnalyzeJobApiResult
}
