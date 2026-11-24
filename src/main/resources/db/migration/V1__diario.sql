create table account (
    id uuid primary key,
    email varchar(254) unique not null,
    password_hash text not null
);
create table category (
    owner uuid not null references account,
    name varchar(80) not null,
    normalized text generated always as (lower(trim(name))) stored,
    primary key (owner, normalized)
);
create table expense (
    owner uuid not null references account,
    id uuid not null,
    description varchar(240) not null,
    amount bigint not null check (amount between 1 and 99999999999),
    date date not null,
    category_key text not null,
    primary key (owner, id),
    foreign key (owner, category_key) references category(owner, normalized)
);
create index expense_history on expense(owner, date desc);
create table voice_budget (
    month date primary key,
    micro_usd integer not null check (micro_usd between 0 and 5000000)
);
