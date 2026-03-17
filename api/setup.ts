import { sql } from '@vercel/postgres'

export const config = {
  runtime: 'nodejs',
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return new Response('Method Not Allowed', { status: 405 })
  }

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
    insert into cards (id, name, image_src)
    values ('rose_red', 'Красная Роза', '/card-rose.png')
    on conflict (id) do update
    set name = excluded.name,
        image_src = excluded.image_src;
  `

  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
}

