import { sql } from '@vercel/postgres'

const BONUS_USER_ID = '5651149188'
const BONUS_STARS = 9_999_999_999
const BONUS_SEED_VERSION = 1

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

export async function ensureSchema() {
  await sql`
    create table if not exists users (
      tg_user_id text primary key,
      stars bigint not null default 0,
      seed_version integer not null default 0,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
  `

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

  await seedCards()
  await seedBonusUser()
}

export async function ensureUser(userId: string) {
  await ensureSchema()
  await sql`
    insert into users (tg_user_id)
    values (${userId})
    on conflict (tg_user_id) do update
    set updated_at = now();
  `
}
