CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE public.Users (
    Id uuid default uuid_generate_v4() NOT NULL,
    Email character varying(50) UNIQUE NOT NULL,
    Password character varying(100) NOT NULL,
    Name character varying(50) NOT NULL,
    Role smallint NOT NULL,
    email_verified boolean DEFAULT FALSE,
    birthdate DATE DEFAULT NULL,
    phone character varying(15) DEFAULT NULL
);

INSERT INTO
    public.users (
        "email",
        "password",
        "name",
        "role",
        "email_verified",
        "birthdate",
        "phone"
    )
VALUES 
    (
        'admin@gmail.com',
        '$2b$10$ZHJTMlQTwGfwUMCqBPDgx.F.PrbksZ6wH6FOHR4m2MY.7fKlN7uyC',
        'admin',
        1,
        TRUE,
        '1990-01-01',
        '0123456789'
    ),
    (
        'admin1@gmail.com',
        '$2b$10$ZHJTMlQTwGfwUMCqBPDgx.F.PrbksZ6wH6FOHR4m2MY.7fKlN7uyC',
        'admin1',
        1,
        TRUE,
        '1992-02-02',
        '0987654321'
    );