import { useQuery } from "@tanstack/react-query"
import { api } from "../lib/api"
import { qk } from "../lib/query-keys"
import { GithubProfileSection } from "./github-block/github-profile-section"

interface Props {
  handle: string
}

export function GithubBlock({ handle }: Props) {
  const { data, error } = useQuery({
    queryKey: qk.connectors.userGithub(handle),
    queryFn: () => api.userGithub(handle),
    retry: false,
  })

  if (error) return null
  if (!data || !data.connected) return null

  return <GithubProfileSection profile={data} />
}
