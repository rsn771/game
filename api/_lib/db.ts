import { sql } from '@vercel/postgres'

const BONUS_USER_ID = '5651149188'
const BONUS_STARS = 9_999_999_999
const BONUS_SEED_VERSION = 1
const SEARCHABLE_USER_IDS = ['7519207725', '728379071'] as const
const INVENTORY_RESET_VERSION = 2
const BUSINESS_SLOT_COUNT = 6
const HUGE_BOUQUET_CARD_ID = 'rose_bouquet_huge'
const HERMES_BAG_CARD_ID = 'hermes_bag_black_blood'
const HOME_SCENE_SLOT_IDS = ['left', 'center', 'right'] as const
const LEGACY_PACK_CARD_IDS = [
  'rose_red',
  'rose_white',
  'knife_kitchen',
  'log',
  'axe_noir',
  'axe',
  'rose_2red',
  'rose_bouquet',
] as const

type SqlRunner = typeof sql
let schemaReadyPromise: Promise<void> | null = null

export type UserProfileInput = {
  userId: string
  username?: string | null
  displayName?: string | null
  avatarModel?: string | null
  avatarFace?: string | null
  avatarItem?: string | null
  sceneItems?: Record<string, string | null> | null
  homeBackground?: string | null
}

function isAnonymousUserId(userId: string): boolean {
  return userId.startsWith('anon_')
}

function normalizeOptionalText(value?: string | null): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function isTimedInventoryCard(cardId: string): boolean {
  return cardId === HUGE_BOUQUET_CARD_ID
}

function isAvatarSceneItem(cardId: string): boolean {
  return cardId === HUGE_BOUQUET_CARD_ID || cardId === HERMES_BAG_CARD_ID
}

function normalizeAvatarFace(value?: string | null): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return ['default', 'annoyed_halfmoon'].includes(trimmed) ? trimmed : null
}

function createEmptySceneItems() {
  return {
    left: null,
    center: null,
    right: null,
  } as Record<(typeof HOME_SCENE_SLOT_IDS)[number], string | null>
}

function normalizeSceneItems(
  value?: Record<string, string | null> | string | null,
  fallbackItemId?: string | null,
) {
  const base = createEmptySceneItems()
  const applyValue = (input: unknown) => {
    if (!input || typeof input !== 'object') return
    for (const slotId of HOME_SCENE_SLOT_IDS) {
      const raw = (input as Record<string, unknown>)[slotId]
      if (typeof raw === 'string' && isAvatarSceneItem(raw.trim())) {
        base[slotId] = raw.trim()
      } else {
        base[slotId] = null
      }
    }
  }

  if (typeof value === 'string') {
    try {
      applyValue(JSON.parse(value) as unknown)
    } catch {
      // ignore malformed legacy payload
    }
  } else {
    applyValue(value)
  }

  if (!base.left && !base.center && !base.right && fallbackItemId && isAvatarSceneItem(fallbackItemId)) {
    base.left = fallbackItemId
  }

  return base
}

function normalizeHomeBackground(value?: string | null): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return ['apartment_sunrise', 'apartment_midnight', 'skyline_studio'].includes(trimmed)
    ? trimmed
    : null
}

function getHomeBackgroundRequiredCardId(backgroundId: string): string | null {
  switch (backgroundId) {
    case 'apartment_sunrise':
    case 'apartment_midnight':
      return 'asset_apartment'
    case 'skyline_studio':
      return 'asset_skyline_studio'
    default:
      return null
  }
}

function isConcurrentCreateRaceError(error: unknown, relationName: string): boolean {
  if (!error || typeof error !== 'object') return false
  const candidate = error as { code?: string; constraint?: string; detail?: string }
  return (
    candidate.code === '23505'
    && candidate.constraint === 'pg_type_typname_nsp_index'
    && typeof candidate.detail === 'string'
    && candidate.detail.includes(`(${relationName},`)
  )
}

async function seedCards(query: SqlRunner) {
  await query`
    insert into cards (id, name, image_src)
    values ('asset_apartment', 'Квартира', '/home-bg-apartment-sunrise.svg')
    on conflict (id) do update
    set name = excluded.name,
        image_src = excluded.image_src;
  `

  await query`
    insert into cards (id, name, image_src)
    values ('asset_skyline_studio', 'Ночная skyline-студия', '/home-bg-apartment-skyline.svg')
    on conflict (id) do update
    set name = excluded.name,
        image_src = excluded.image_src;
  `

  await query`
    insert into cards (id, name, image_src)
    values ('rose_red', 'Красная Роза', '/card-rose.png')
    on conflict (id) do update
    set name = excluded.name,
        image_src = excluded.image_src;
  `

  await query`
    insert into cards (id, name, image_src)
    values ('rose_white', 'Белая Роза', '/card-rose-white.png')
    on conflict (id) do update
    set name = excluded.name,
        image_src = excluded.image_src;
  `

  await query`
    insert into cards (id, name, image_src)
    values ('knife_kitchen', 'Кухонный нож', '/card-knife-kitchen.png')
    on conflict (id) do update
    set name = excluded.name,
        image_src = excluded.image_src;
  `

  await query`
    insert into cards (id, name, image_src)
    values ('log', 'Бревно', '/card-log.png')
    on conflict (id) do update
    set name = excluded.name,
        image_src = excluded.image_src;
  `

  await query`
    insert into cards (id, name, image_src)
    values ('axe_noir', 'Топор нуар', '/card-axe-noir.png')
    on conflict (id) do update
    set name = excluded.name,
        image_src = excluded.image_src;
  `

  await query`
    insert into cards (id, name, image_src)
    values ('axe', 'Топор', '/card-axe.png')
    on conflict (id) do update
    set name = excluded.name,
        image_src = excluded.image_src;
  `

  await query`
    insert into cards (id, name, image_src)
    values ('rose_2red', '2 красные розы', '/card-rose-2red.png')
    on conflict (id) do update
    set name = excluded.name,
        image_src = excluded.image_src;
  `

  await query`
    insert into cards (id, name, image_src)
    values ('rose_bouquet', 'Букет красных роз', '/card-rose-bouquet.png')
    on conflict (id) do update
    set name = excluded.name,
        image_src = excluded.image_src;
  `

  await query`
    insert into cards (id, name, image_src)
    values (${HUGE_BOUQUET_CARD_ID}, 'Огромный букет красных роз', '/card-rose-bouquet-huge.png')
    on conflict (id) do update
    set name = excluded.name,
        image_src = excluded.image_src;
  `

  await query`
    insert into cards (id, name, image_src)
    values (${HERMES_BAG_CARD_ID}, 'Сумка Hermes', '/card-hermes-bag-black-blood.png')
    on conflict (id) do update
    set name = excluded.name,
        image_src = excluded.image_src;
  `
}

async function seedBonusUser(query: SqlRunner) {
  await query`
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

async function seedSearchableUsers(query: SqlRunner) {
  for (const userId of SEARCHABLE_USER_IDS) {
    await query`
      insert into users (tg_user_id)
      values (${userId})
      on conflict (tg_user_id) do nothing;
    `
  }
}

async function resetInventoryIfNeeded(query: SqlRunner) {
  const { rows } = await query<{ value: string }>`
    select value
    from app_meta
    where key = 'inventory_reset_version'
    limit 1;
  `

  const currentVersion = Number(rows[0]?.value ?? '0')
  if (currentVersion >= INVENTORY_RESET_VERSION) return

  await query`
    delete from inventory
    where card_id in (
      ${LEGACY_PACK_CARD_IDS[0]},
      ${LEGACY_PACK_CARD_IDS[1]},
      ${LEGACY_PACK_CARD_IDS[2]},
      ${LEGACY_PACK_CARD_IDS[3]},
      ${LEGACY_PACK_CARD_IDS[4]},
      ${LEGACY_PACK_CARD_IDS[5]},
      ${LEGACY_PACK_CARD_IDS[6]},
      ${LEGACY_PACK_CARD_IDS[7]}
    );
  `

  await query`
    insert into app_meta (key, value)
    values ('inventory_reset_version', ${String(INVENTORY_RESET_VERSION)})
    on conflict (key)
    do update set value = excluded.value;
  `
}

async function ensureSchemaOnce() {
  const query = sql as SqlRunner

  await query`
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

  await query`alter table users add column if not exists username text;`
  await query`alter table users add column if not exists display_name text;`
  await query`alter table users add column if not exists last_pack_opened_at timestamptz;`
  await query`alter table users add column if not exists avatar_model text;`
  await query`alter table users add column if not exists avatar_face text;`
  await query`alter table users add column if not exists face_annoyed_unlocked boolean not null default false;`
  await query`alter table users add column if not exists avatar_item text;`
  await query`alter table users add column if not exists scene_items text;`
  await query`alter table users add column if not exists home_background text;`
  await query`update users set avatar_model = 'classic' where avatar_model is null;`
  await query`alter table users alter column avatar_model set default 'classic';`
  await query`update users set avatar_face = 'default' where avatar_face is null;`
  await query`alter table users alter column avatar_face set default 'default';`

  await query`
    create table if not exists cards (
      id text primary key,
      name text not null,
      image_src text not null
    );
  `

  await query`
    create table if not exists inventory (
      user_id text not null,
      card_id text not null references cards(id),
      qty integer not null default 1,
      primary key (user_id, card_id)
    );
  `

  await query`
    create table if not exists inventory_timed (
      id bigserial primary key,
      user_id text not null references users(tg_user_id) on delete cascade,
      card_id text not null references cards(id),
      expires_at timestamptz not null,
      created_at timestamptz not null default now()
    );
  `

  await query`
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

  await query`
    create table if not exists businesses (
      owner_user_id text primary key references users(tg_user_id) on delete cascade,
      name text not null,
      description text not null default '',
      capital bigint not null default 80000,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
  `

  try {
    await query`
      create table if not exists business_staff (
        owner_user_id text not null references businesses(owner_user_id) on delete cascade,
        slot_index integer not null,
        employee_user_id text unique references users(tg_user_id) on delete set null,
        role_name text not null default '',
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        primary key (owner_user_id, slot_index),
        check (slot_index >= 0 and slot_index < 6)
      );
    `
  } catch (error) {
    if (!isConcurrentCreateRaceError(error, 'business_staff')) {
      throw error
    }
  }

  await query`
    create table if not exists business_invites (
      id bigserial primary key,
      owner_user_id text not null references businesses(owner_user_id) on delete cascade,
      sender_user_id text not null references users(tg_user_id) on delete cascade,
      slot_index integer not null,
      target_user_id text not null references users(tg_user_id) on delete cascade,
      role_name text not null default '',
      status text not null default 'pending',
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      check (slot_index >= 0 and slot_index < 6),
      check (status in ('pending', 'accepted', 'declined', 'cancelled'))
    );
  `

  await query`
    create table if not exists business_join_requests (
      id bigserial primary key,
      owner_user_id text not null references businesses(owner_user_id) on delete cascade,
      requester_user_id text not null references users(tg_user_id) on delete cascade,
      reviewed_by_user_id text references users(tg_user_id) on delete set null,
      status text not null default 'pending',
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      check (status in ('pending', 'accepted', 'declined', 'cancelled'))
    );
  `

  await query`
    create table if not exists app_meta (
      key text primary key,
      value text not null
    );
  `

  await query`
    create index if not exists users_username_lower_idx
    on users (lower(username));
  `

  await query`
    create index if not exists users_display_name_lower_idx
    on users (lower(display_name));
  `

  await query`
    create index if not exists friend_requests_to_status_idx
    on friend_requests (to_user_id, status, updated_at desc);
  `

  await query`
    create index if not exists friend_requests_from_status_idx
    on friend_requests (from_user_id, status, updated_at desc);
  `

  await query`
    create index if not exists business_staff_owner_idx
    on business_staff (owner_user_id, slot_index);
  `

  await query`
    create index if not exists business_staff_employee_idx
    on business_staff (employee_user_id);
  `

  await query`
    create index if not exists business_invites_target_status_idx
    on business_invites (target_user_id, status, updated_at desc);
  `

  await query`
    create index if not exists business_invites_owner_status_idx
    on business_invites (owner_user_id, status, updated_at desc);
  `

  await query`
    create index if not exists business_invites_sender_status_idx
    on business_invites (sender_user_id, status, updated_at desc);
  `

  await query`
    create unique index if not exists business_invites_pending_slot_idx
    on business_invites (owner_user_id, slot_index)
    where status = 'pending';
  `

  await query`
    create unique index if not exists business_invites_pending_target_idx
    on business_invites (target_user_id)
    where status = 'pending';
  `

  await query`
    create index if not exists business_join_requests_owner_status_idx
    on business_join_requests (owner_user_id, status, updated_at desc);
  `

  await query`
    create index if not exists business_join_requests_requester_status_idx
    on business_join_requests (requester_user_id, status, updated_at desc);
  `

  await query`
    create index if not exists inventory_timed_user_expires_idx
    on inventory_timed (user_id, expires_at asc);
  `

  await query`
    create index if not exists inventory_timed_user_card_idx
    on inventory_timed (user_id, card_id);
  `

  await query`
    create unique index if not exists business_join_requests_pending_pair_idx
    on business_join_requests (owner_user_id, requester_user_id)
    where status = 'pending';
  `

  await seedCards(query)
  await seedBonusUser(query)
  await seedSearchableUsers(query)
  await resetInventoryIfNeeded(query)
}

export async function ensureSchema() {
  if (!schemaReadyPromise) {
    schemaReadyPromise = ensureSchemaOnce().catch((error) => {
      schemaReadyPromise = null
      throw error
    })
  }

  await schemaReadyPromise
}

export async function ensureUser(userId: string) {
  await upsertUserProfile({ userId })
}

export async function upsertUserProfile(input: UserProfileInput) {
  await ensureSchema()
  const username = normalizeOptionalText(input.username)
  const displayName = normalizeOptionalText(input.displayName)
  const avatarModel = normalizeOptionalText(input.avatarModel)
  const avatarFaceProvided = Object.prototype.hasOwnProperty.call(input, 'avatarFace')
  const avatarFace = avatarFaceProvided ? normalizeAvatarFace(input.avatarFace) : null
  const avatarItemProvided = Object.prototype.hasOwnProperty.call(input, 'avatarItem')
  const avatarItem = avatarItemProvided ? normalizeOptionalText(input.avatarItem) : null
  const sceneItemsProvided = Object.prototype.hasOwnProperty.call(input, 'sceneItems')
  const sceneItems = sceneItemsProvided
    ? JSON.stringify(normalizeSceneItems(input.sceneItems ?? null))
    : null
  const homeBackgroundProvided = Object.prototype.hasOwnProperty.call(input, 'homeBackground')
  const homeBackground = homeBackgroundProvided ? normalizeHomeBackground(input.homeBackground) : null

  await sql`
    insert into users (tg_user_id, username, display_name, avatar_model, avatar_face, avatar_item, scene_items, home_background)
    values (${input.userId}, ${username}, ${displayName}, coalesce(${avatarModel}, 'classic'), 'default', ${avatarItem}, ${sceneItems}, ${homeBackground})
    on conflict (tg_user_id) do update
    set username = coalesce(excluded.username, users.username),
        display_name = coalesce(excluded.display_name, users.display_name),
        avatar_model = coalesce(${avatarModel}, users.avatar_model),
        avatar_face = case
          when ${avatarFaceProvided} then case
            when coalesce(${avatarFace}, 'default') = 'annoyed_halfmoon' and users.face_annoyed_unlocked then 'annoyed_halfmoon'
            else 'default'
          end
          else users.avatar_face
        end,
        avatar_item = case
          when ${avatarItemProvided} then ${avatarItem}
          else users.avatar_item
        end,
        scene_items = case
          when ${sceneItemsProvided} then ${sceneItems}
          else users.scene_items
        end,
        home_background = case
          when ${homeBackgroundProvided} then ${homeBackground}
          else users.home_background
        end,
        updated_at = now();
  `
}

export async function migrateAnonymousUserData(previousUserId: string, nextUserId: string) {
  await ensureSchema()
  if (!isAnonymousUserId(previousUserId) || previousUserId === nextUserId) return

  await ensureUser(nextUserId)

  await sql`
    update users as target
    set stars = greatest(target.stars, source.stars),
        avatar_model = case
          when target.avatar_model = 'classic' and source.avatar_model is not null then source.avatar_model
          else target.avatar_model
        end,
        updated_at = now()
    from users as source
    where target.tg_user_id = ${nextUserId}
      and source.tg_user_id = ${previousUserId};
  `

  await sql`
    insert into inventory (user_id, card_id, qty)
    select ${nextUserId}, card_id, qty
    from inventory
    where user_id = ${previousUserId}
    on conflict (user_id, card_id)
    do update set qty = inventory.qty + excluded.qty;
  `

  await sql`
    delete from inventory
    where user_id = ${previousUserId};
  `

  await sql`
    insert into inventory_timed (user_id, card_id, expires_at, created_at)
    select ${nextUserId}, card_id, expires_at, created_at
    from inventory_timed
    where user_id = ${previousUserId}
      and expires_at > now();
  `

  await sql`
    delete from inventory_timed
    where user_id = ${previousUserId};
  `

  await sql`
    update users as target
    set avatar_item = case
          when target.avatar_item is null and source.avatar_item is not null then source.avatar_item
          else target.avatar_item
        end,
        avatar_face = case
          when target.avatar_face = 'default'
            and source.face_annoyed_unlocked
            and source.avatar_face = 'annoyed_halfmoon'
            then 'annoyed_halfmoon'
          else target.avatar_face
        end,
        face_annoyed_unlocked = target.face_annoyed_unlocked or coalesce(source.face_annoyed_unlocked, false),
        scene_items = case
          when target.scene_items is null and source.scene_items is not null then source.scene_items
          else target.scene_items
        end,
        home_background = case
          when target.home_background is null and source.home_background is not null then source.home_background
          else target.home_background
        end,
        updated_at = now()
    from users as source
    where target.tg_user_id = ${nextUserId}
      and source.tg_user_id = ${previousUserId};
  `

  const sourceProfile = await sql<{ avatar_item: string | null; scene_items: string | null }>`
    select avatar_item, scene_items
    from users
    where tg_user_id = ${previousUserId}
    limit 1;
  `

  const migratedSceneItems = normalizeSceneItems(
    sourceProfile.rows[0]?.scene_items ?? null,
    sourceProfile.rows[0]?.avatar_item ?? null,
  )

  await sql`
    update users
    set scene_items = case
          when scene_items is null then ${JSON.stringify(migratedSceneItems)}
          else scene_items
        end,
        updated_at = now()
    where tg_user_id = ${nextUserId};
  `

  await sql`
    insert into friend_requests (from_user_id, to_user_id, status, created_at, updated_at)
    select ${nextUserId}, to_user_id, status, created_at, updated_at
    from friend_requests
    where from_user_id = ${previousUserId}
      and to_user_id <> ${nextUserId}
    on conflict (from_user_id, to_user_id)
    do update set
      status = case
        when friend_requests.status = 'accepted' or excluded.status = 'accepted' then 'accepted'
        else excluded.status
      end,
      updated_at = greatest(friend_requests.updated_at, excluded.updated_at);
  `

  await sql`
    insert into friend_requests (from_user_id, to_user_id, status, created_at, updated_at)
    select from_user_id, ${nextUserId}, status, created_at, updated_at
    from friend_requests
    where to_user_id = ${previousUserId}
      and from_user_id <> ${nextUserId}
    on conflict (from_user_id, to_user_id)
    do update set
      status = case
        when friend_requests.status = 'accepted' or excluded.status = 'accepted' then 'accepted'
        else excluded.status
      end,
      updated_at = greatest(friend_requests.updated_at, excluded.updated_at);
  `

  await sql`
    delete from friend_requests
    where from_user_id = ${previousUserId}
       or to_user_id = ${previousUserId};
  `

  await sql`
    update business_staff
    set employee_user_id = ${nextUserId},
        updated_at = now()
    where employee_user_id = ${previousUserId}
      and not exists (
        select 1
        from business_staff existing
        where existing.employee_user_id = ${nextUserId}
      );
  `

  await sql`
    update business_invites
    set sender_user_id = ${nextUserId},
        updated_at = now()
    where sender_user_id = ${previousUserId};
  `

  await sql`
    update business_invites
    set target_user_id = ${nextUserId},
        updated_at = now()
    where target_user_id = ${previousUserId}
      and not exists (
        select 1
        from business_invites existing
        where existing.target_user_id = ${nextUserId}
          and existing.status = 'pending'
      );
  `

  await sql`
    update business_invites
    set status = 'cancelled',
        updated_at = now()
    where target_user_id = ${previousUserId}
       or sender_user_id = ${previousUserId};
  `
}

export async function getUserById(userId: string) {
  await ensureSchema()
  await sql`
    delete from inventory_timed
    where user_id = ${userId}
      and expires_at <= now();
  `

  const { rows: avatarRows } = await sql<{ avatar_item: string | null; scene_items: string | null }>`
    select avatar_item,
           scene_items
    from users
    where tg_user_id = ${userId}
    limit 1;
  `

  const currentAvatarItem = avatarRows[0]?.avatar_item ?? null
  const sceneItems = normalizeSceneItems(avatarRows[0]?.scene_items ?? null, currentAvatarItem)
  if (currentAvatarItem) {
    const { rows: availabilityRows } = isTimedInventoryCard(currentAvatarItem)
      ? await sql<{ available: boolean }>`
          select exists(
            select 1
            from inventory_timed
            where user_id = ${userId}
              and card_id = ${currentAvatarItem}
              and expires_at > now()
          ) as available;
        `
      : await sql<{ available: boolean }>`
          select exists(
            select 1
            from inventory
            where user_id = ${userId}
              and card_id = ${currentAvatarItem}
              and qty > 0
          ) as available;
        `

    if (!availabilityRows[0]?.available) {
      await sql`
        update users
        set avatar_item = null,
            updated_at = now()
        where tg_user_id = ${userId};
      `
    }
  }

  const { rows: availableSceneRows } = await sql<{ card_id: string; total_count: number }>`
    with permanent_items as (
      select card_id, qty::integer as total_count
      from inventory
      where user_id = ${userId}
        and card_id in (${HUGE_BOUQUET_CARD_ID}, ${HERMES_BAG_CARD_ID})
    ),
    timed_items as (
      select card_id, count(*)::integer as total_count
      from inventory_timed
      where user_id = ${userId}
        and expires_at > now()
        and card_id in (${HUGE_BOUQUET_CARD_ID}, ${HERMES_BAG_CARD_ID})
      group by card_id
    )
    select card_id, sum(total_count)::integer as total_count
    from (
      select * from permanent_items
      union all
      select * from timed_items
    ) all_items
    group by card_id;
  `

  const availableSceneCount = new Map<string, number>()
  for (const row of availableSceneRows) {
    availableSceneCount.set(row.card_id, row.total_count)
  }

  const sanitizedSceneItems = createEmptySceneItems()
  const usedSceneCount = new Map<string, number>()
  for (const slotId of HOME_SCENE_SLOT_IDS) {
    const cardId = sceneItems[slotId]
    if (!cardId) continue
    const nextUsedCount = (usedSceneCount.get(cardId) ?? 0) + 1
    const availableCount = availableSceneCount.get(cardId) ?? 0
    if (nextUsedCount > availableCount) continue
    usedSceneCount.set(cardId, nextUsedCount)
    sanitizedSceneItems[slotId] = cardId
  }

  const normalizedStoredSceneItems = normalizeSceneItems(avatarRows[0]?.scene_items ?? null, currentAvatarItem)
  const sceneItemsChanged = HOME_SCENE_SLOT_IDS.some((slotId) => normalizedStoredSceneItems[slotId] !== sanitizedSceneItems[slotId])
  if (sceneItemsChanged) {
    await sql`
      update users
      set scene_items = ${JSON.stringify(sanitizedSceneItems)},
          avatar_item = null,
          updated_at = now()
      where tg_user_id = ${userId};
    `
  } else if (currentAvatarItem && !avatarRows[0]?.scene_items) {
    await sql`
      update users
      set scene_items = ${JSON.stringify(sanitizedSceneItems)},
          avatar_item = null,
          updated_at = now()
      where tg_user_id = ${userId};
    `
  }

  const { rows: backgroundRows } = await sql<{ home_background: string | null }>`
    select home_background
    from users
    where tg_user_id = ${userId}
    limit 1;
  `

  const currentHomeBackground = backgroundRows[0]?.home_background ?? null
  if (currentHomeBackground) {
    const requiredCardId = getHomeBackgroundRequiredCardId(currentHomeBackground)
    const availableRows = requiredCardId
      ? await sql<{ available: boolean }>`
          select exists(
            select 1
            from inventory
            where user_id = ${userId}
              and card_id = ${requiredCardId}
              and qty > 0
          ) as available;
        `
      : { rows: [{ available: false }] }

    if (!availableRows.rows[0]?.available) {
      await sql`
        update users
        set home_background = null,
            updated_at = now()
        where tg_user_id = ${userId};
      `
    }
  }

  const { rows: faceRows } = await sql<{ avatar_face: string | null; face_annoyed_unlocked: boolean }>`
    select avatar_face,
           face_annoyed_unlocked
    from users
    where tg_user_id = ${userId}
    limit 1;
  `

  if (
    faceRows[0]?.avatar_face === 'annoyed_halfmoon'
    && !faceRows[0]?.face_annoyed_unlocked
  ) {
    await sql`
      update users
      set avatar_face = 'default',
          updated_at = now()
      where tg_user_id = ${userId};
    `
  }

  const { rows } = await sql<{
    tg_user_id: string
    username: string | null
    display_name: string | null
    stars: string
    avatar_model: string | null
    avatar_face: string | null
    face_annoyed_unlocked: boolean
    avatar_item: string | null
    scene_items: string | null
    home_background: string | null
  }>`
    select tg_user_id,
           username,
           display_name,
           stars::text as stars,
           coalesce(avatar_model, 'classic') as avatar_model,
           coalesce(avatar_face, 'default') as avatar_face,
           coalesce(face_annoyed_unlocked, false) as face_annoyed_unlocked,
           avatar_item,
           scene_items,
           home_background
    from users
    where tg_user_id = ${userId}
    limit 1;
  `
  return rows[0] ?? null
}
