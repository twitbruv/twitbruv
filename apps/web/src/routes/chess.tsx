import { Link, createFileRoute } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { IconTrophy, IconSwords } from "@tabler/icons-react"
import { Button } from "@workspace/ui/components/button"
import { PageHeader, PageLoading, PageEmpty } from "../components/page-surface"
import { PageFrame } from "../components/page-frame"
import { api } from "../lib/api"
import { useMe } from "../lib/me"
import { Avatar } from "../components/avatar"

export const Route = createFileRoute("/chess")({
  component: ChessHome,
})

function ChessHome() {
  const { me } = useMe()
  
  const { data: activeGames, isLoading: gamesLoading } = useQuery({
    queryKey: ["chess", "active"],
    queryFn: () => api.chessActiveGames(),
    enabled: !!me,
  })

  const { data: leaderboard, isLoading: leaderboardLoading } = useQuery({
    queryKey: ["chess", "leaderboard"],
    queryFn: () => api.chessLeaderboard(),
  })

  return (
    <PageFrame>
      <main>
        <PageHeader title="Chess" />
        
        <div className="p-4 flex flex-col gap-8">
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <IconSwords size={20} />
                Active Games
              </h2>
              <Button size="sm" nativeButton={false} render={<Link to="/search" />}>
                Find Opponent
              </Button>
            </div>
            
            {gamesLoading ? (
              <PageLoading label="Loading games..." />
            ) : activeGames?.games && activeGames.games.length > 0 ? (
              <div className="grid gap-2">
                {activeGames.games.map((game) => (
                  <Link
                    key={game.id}
                    to="/chess/$id"
                    params={{ id: game.id }}
                    className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted/40 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex -space-x-2">
                        <div className="size-8 rounded-full bg-white border border-border" title="White" />
                        <div className="size-8 rounded-full bg-zinc-800 border border-border" title="Black" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">Game #{game.id.slice(0, 8)}</p>
                        <p className="text-xs text-muted-foreground">Updated {new Date(game.updatedAt).toLocaleString()}</p>
                      </div>
                    </div>
                    <Button size="sm" variant="outline">Play</Button>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 border border-dashed border-border rounded-lg">
                <p className="text-sm text-muted-foreground mb-4">No active games.</p>
                <Button nativeButton={false} render={<Link to="/search" />}>
                  Start a new game
                </Button>
              </div>
            )}
          </section>

          <section>
            <h2 className="text-lg font-bold flex items-center gap-2 mb-4">
              <IconTrophy size={20} className="text-yellow-500" />
              Leaderboard
            </h2>
            
            {leaderboardLoading ? (
              <PageLoading label="Loading leaderboard..." />
            ) : leaderboard?.leaderboard && leaderboard.leaderboard.length > 0 ? (
              <div className="border border-border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 border-b border-border">
                    <tr>
                      <th className="px-4 py-2 text-left font-medium">Rank</th>
                      <th className="px-4 py-2 text-left font-medium">Player</th>
                      <th className="px-4 py-2 text-right font-medium">ELO</th>
                      <th className="px-4 py-2 text-right font-medium">W / L / D</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leaderboard.leaderboard.map((stats, i) => (
                      <tr key={stats.userId} className="border-b border-border last:border-0 hover:bg-muted/20">
                        <td className="px-4 py-3 font-medium">#{i + 1}</td>
                        <td className="px-4 py-3">
                          <Link 
                            to="/$handle" 
                            params={{ handle: stats.handle || stats.userId }}
                            className="flex items-center gap-2 hover:underline"
                          >
                            <Avatar 
                              initial={(stats.displayName ?? stats.handle ?? "?").slice(0, 1).toUpperCase()} 
                              src={stats.avatarUrl} 
                              size={24} 
                            />
                            <span>{stats.displayName || stats.handle || "User"}</span>
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-primary">{stats.elo}</td>
                        <td className="px-4 py-3 text-right text-muted-foreground tabular-nums">
                          {stats.wins} / {stats.losses} / {stats.draws}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <PageEmpty title="No stats yet" description="Games haven't been played yet." />
            )}
          </section>
        </div>
      </main>
    </PageFrame>
  )
}
