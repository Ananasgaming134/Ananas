import type { TeamGroup } from "@/lib/team";

export default function TeamSection({ groups }: { groups: TeamGroup[] }) {
  if (groups.length === 0) return null;

  return (
    <section className="mx-auto max-w-6xl px-6 pb-24">
      <div className="mb-10 text-center">
        <span className="text-xs font-medium uppercase tracking-widest text-accent">
          Unser Team
        </span>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
          Die Menschen hinter dem LeihCenter
        </h2>
      </div>

      <div className="space-y-10">
        {groups.map((group) => (
          <div key={group.key}>
            <div className="mb-4 flex items-center gap-3">
              <h3 className="text-sm font-semibold text-muted">{group.label}</h3>
              <div className="divider-glow flex-1" />
            </div>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {group.members.map((member) => (
                <div
                  key={member.discordId}
                  className="card card-hover flex flex-col items-center gap-3 p-5 text-center"
                >
                  {member.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={member.avatarUrl}
                      alt={member.displayName}
                      className="h-16 w-16 rounded-full border border-border object-cover"
                    />
                  ) : (
                    <div className="flex h-16 w-16 items-center justify-center rounded-full border border-border bg-surface-2 text-lg font-semibold text-muted">
                      {member.displayName.slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  <div>
                    <p className="text-sm font-medium">{member.displayName}</p>
                    <p className="text-xs text-muted">@{member.username}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
