import { sql } from '@vercel/postgres'

const BONUS_USER_ID = '5651149188'
const BONUS_STARS = 9_999_999_999
const BONUS_SEED_VERSION = 1
const SEARCHABLE_USER_IDS = ['7519207725', '728379071'] as const

export type UserProfileInput = {
  userId: string
  username?: string | null
  displayName?: string | null
}

function normalizeOptionalText(value?: string | null): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

async function seedCards() {
  await sql`
    insert into cards (id, name, image_src)
    values ('rose_red', 'Красная Роза', '/card-rose.png')
    on conflict (id) do update
    set name = excluded.name,
        image_src = excluded.image_src;
  `

  await sql`
    insert into cards (id, name, image_src)
    values ('rose_white', 'Белая Роза', '/card-rose-white.png')
    on conflict (id) do update
    set name = excluded.name,
        image_src = excluded.image_src;
  `

  await sql`
    insert into cards (id, name, image_src)
    values ('knife_kitchen', 'Кухонный нож', '/card-knife-kitchen.png')
    on conflict (id) do update
    set name = excluded.name,
        image_src = excluded.image_src;
  `

  await sql`
    insert into cards (id, name, image_src)
    values ('log', 'Бревно', '/card-log.png')
    on conflict (id) do update
    set name = excluded.name,
        image_src = excluded.image_src;
  `

  await sql`
    insert into cards (id, name, image_src)
    values ('axe_noir', 'Топор нуар', '/card-axe-noir.png')
    on conflict (id) do update
    set name = excluded.name,
        image_src = excluded.image_src;
  `

  await sql`
    insert into cards (id, name, image_src)
    values ('axe', 'Топор', '/card-axe.png')
    on conflict (id) do update
    set name = excluded.name,
        image_src = excluded.image_src;
  `

  await sql`
    insert into cards (id, name, image_src)
    values ('rose_2red', '2 красные розы', '/card-rose-2red.png')
    on conflict (id) do update
    set name = excluded.name,
        image_src = excluded.image_src;
  `

  await sql`
    insert into cards (id, name, image_src)
    values ('rose_bouquet', 'Букет красных роз', '/card-rose-bouquet.png')
    on conflict (id) do update
    set name = excluded.name,
        image_src = excluded.image_src;
  `
}

async function seedBonusUser() {
  await sql`
    insert into users (tg_user_id, stars, seed_version)
    values (${BONUS_USER_ID}, ${BONUS_STARS}, ${BONUS_SEED_VERSION})
    on conflict (tg_user_id) do update
    set stars = case
      when users.seed_version < excluded.seed_version then greatest(users.stars, excluded.stars)
      else users.stars
    end,
    seed_version = greatest(users.seed_version, excluded.seed_version),
    updated_at = now();
  `
}

async function seedSearchableUsers() {
  for (const userId of SEARCHABLE_USER_IDS) {
    await sql`
      insert into users (tg_user_id)
      values (${userId})
      on conflict (tg_user_id) do nothing;
    `
  }
}

export async function ensureSchema() {
  await sql`
    create table if not exists users (
      tg_user_id text primary key,
      username text,
      display_name text,
      stars bigint not null default 0,
      seed_version integer not null default 0,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
  `

  await sql`alter table users add column if not exists username text;`
  await sql`alter table users add column if not exists display_name text;`

  await sql`
    create table if not exists cards (
      id text primary key,
      name text not null,
      image_src text not null
    );
  `

  await sql`
    create table if not exists inventory (
      user_id text not null,
      card_id text not null references cards(id),
      qty integer not null default 1,
      primary key (user_id, card_id)
    );
  `

  await sql`
    create table if not exists friend_requests (
      from_user_id text not null references users(tg_user_id) on delete cascade,
      to_user_id text not null references users(tg_user_id) on delete cascade,
      status text not null default 'pending',
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      primary key (from_user_id, to_user_id),
      check (from_user_id <> to_user_id),
      check (status in ('pending', 'accepted'))
    );
  `

  await sql`
    create index if not exists users_username_lower_idx
    on users (lower(username));
  `

  await sql`
    create index if not exists users_display_name_lower_idx
    on users (lower(display_name));
  `

  await sql`
    create index if not exists friend_requests_to_status_idx
    on friend_requests (to_user_id, status, updated_at desc);
  `

  await sql`
    create index if not exists friend_requests_from_status_idx
    on friend_requests (from_user_id, status, updated_at desc);
  `

  await seedCards()
  await seedBonusUser()
  await seedSearchableUsers()
}

export async function ensureUser(userId: string) {
  await upsertUserProfile({ userId })
}

export async function upsertUserProfile(input: UserProfileInput) {
  await ensureSchema()
  const username = normalizeOptionalText(input.username)
  const displayName = normalizeOptionalText(input.displayName)

  await sql`
    insert into users (tg_user_id, username, display_name)
    values (${input.userId}, ${username}, ${displayName})
    on conflict (tg_user_id) do update
    set username = coalesce(excluded.username, users.username),
        display_name = coalesce(excluded.display_name, users.display_name),
        updated_at = now();
  `
}

export async function getUserById(userId: string) {
  await ensureSchema()
  const { rows } = await sql<{ tg_user_id: string; username: string | null; display_name: string | null; stars: string }>`
    select tg_user_id, username, display_name, stars::text as stars
    from users
    where tg_user_id = ${userId}
    limit 1;
  `
  return rows[0] ?? null
}
