export type HomeThreadFromFeedSearch = {
  from: "home"
  homePostId: string
  homePostHandle: string
}

export function homeThreadFromFeedSearch(
  homePostId: string,
  homePostHandle: string
): HomeThreadFromFeedSearch {
  return { from: "home", homePostId, homePostHandle }
}
