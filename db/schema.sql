-- Modelo de datos para Postgres. No está aplicado en ninguna base: hoy el motor Demo
-- guarda todo en memoria detrás de `OfficeRepository` (src/server/ports.ts).
-- Espeja src/domain/types.ts: si cambia uno, cambia el otro.

create table agent (
  id            text primary key,
  name          text not null,
  role          text not null,
  description   text not null,
  capability    text not null check (capability in ('manager', 'research', 'development', 'marketing')),
  tools         text[] not null default '{}',
  -- Pelo, piel, ropa y acento: es un dibujo, no se consulta por campo.
  appearance    jsonb not null,
  desk_id       text not null,
  status        text not null check (status in ('idle', 'working', 'walking', 'meeting', 'waiting_approval', 'paused', 'offline')),
  status_detail text,
  mood          text not null check (mood in ('neutral', 'focused', 'happy', 'worried', 'sad')),
  location      text not null,
  current_task_id text,
  activity      real not null default 0 check (activity between 0 and 1),
  input_tokens  bigint not null default 0,
  output_tokens bigint not null default 0,
  cache_read_tokens  bigint not null default 0,
  cache_write_tokens bigint not null default 0,
  -- Null cuando la fuente no da un costo que se pueda sostener.
  cost_usd      numeric(12, 4)
);

create table task (
  id            text primary key,
  title         text not null,
  description   text not null,
  status        text not null check (status in ('pending', 'in_progress', 'waiting_review', 'done', 'failed', 'cancelled')),
  priority      text not null check (priority in ('low', 'normal', 'high')),
  assignee_id   text references agent (id),
  parent_id     text references task (id),
  depends_on    text[] not null default '{}',
  revision      integer not null default 0,
  progress      real check (progress between 0 and 1),
  output        text,
  failure_reason text,
  estimated_cost_usd numeric(12, 4),
  input_tokens  bigint not null default 0,
  output_tokens bigint not null default 0,
  cache_read_tokens  bigint not null default 0,
  cache_write_tokens bigint not null default 0,
  created_at    timestamptz not null default now(),
  started_at    timestamptz,
  finished_at   timestamptz,
  updated_at    timestamptz not null default now()
);

create index task_status_idx on task (status);
create index task_parent_idx on task (parent_id);

alter table agent
  add constraint agent_current_task_fk foreign key (current_task_id) references task (id);

-- Una tarea cambia de manos: cada asignación queda registrada, no se pisa.
create table assignment (
  id          text primary key,
  task_id     text not null references task (id),
  agent_id    text not null references agent (id),
  -- `human` o el id del agente que la asignó.
  assigned_by text not null,
  assigned_at timestamptz not null default now(),
  released_at timestamptz,
  reason      text
);

create index assignment_task_idx on assignment (task_id);

create table office_event (
  id              text primary key,
  at              timestamptz not null default now(),
  type            text not null,
  channel         text not null check (channel in ('system', 'log', 'reasoning', 'message')),
  body            text not null,
  agent_id        text references agent (id),
  target_agent_id text references agent (id),
  task_id         text references task (id)
);

create index office_event_at_idx on office_event (at desc);
create index office_event_agent_idx on office_event (agent_id, at desc);

create table deliverable (
  id          text primary key,
  task_id     text not null references task (id),
  agent_id    text not null references agent (id),
  title       text not null,
  summary     text not null,
  body        text not null,
  status      text not null check (status in ('pending_review', 'approved', 'rejected', 'changes_requested', 'reported', 'cancelled')),
  simulated   boolean not null default false,
  reviewable  boolean not null default true,
  revision    integer not null default 0,
  review_note text,
  created_at  timestamptz not null default now(),
  reviewed_at timestamptz
);

create index deliverable_pending_idx on deliverable (created_at) where status = 'pending_review';
