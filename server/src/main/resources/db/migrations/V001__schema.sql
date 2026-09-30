-- ══════════════════════════════════════════════════════════════════════════
--  V001: the complete webpost.ing schema
--
--  One file for a fresh database. It replaces the earlier chain of
--  migrations (the old V001–V024, plus config/database.sql and the v1 import),
--  squashed on 2026-09-29 when backward compatibility was dropped.
--
--  Future changes go in V002 onwards; never edit this file once a database
--  has applied it (the runner checks a checksum). To move an existing
--  database onto this baseline, see tools/reset-schema.sh.
-- ══════════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;
CREATE TABLE public.activity_deletions (
    id integer NOT NULL,
    user_id integer NOT NULL,
    item_type character varying(32) NOT NULL,
    summary text,
    post_id integer,
    post_title character varying(255) DEFAULT NULL::character varying,
    post_owner character varying(32) DEFAULT NULL::character varying,
    deleted_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE SEQUENCE public.activity_deletions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.activity_deletions_id_seq OWNED BY public.activity_deletions.id;
CREATE TABLE public.comment_reactions (
    comment_id integer NOT NULL,
    user_id integer NOT NULL,
    reaction character varying(20) NOT NULL
);
CREATE TABLE public.comment_votes (
    comment_id integer NOT NULL,
    user_id integer NOT NULL,
    vote smallint NOT NULL,
    CONSTRAINT comment_votes_vote_check CHECK ((vote = ANY (ARRAY['-1'::integer, 1])))
);
CREATE TABLE public.comments (
    id integer NOT NULL,
    discussion_id integer NOT NULL,
    parent_id integer,
    user_id integer NOT NULL,
    content text NOT NULL,
    score integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    edited_at timestamp with time zone
);
CREATE SEQUENCE public.comments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.comments_id_seq OWNED BY public.comments.id;
CREATE TABLE public.conversations (
    id integer NOT NULL,
    user1_id integer NOT NULL,
    user2_id integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT conversations_ordered CHECK ((user1_id < user2_id))
);
CREATE SEQUENCE public.conversations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.conversations_id_seq OWNED BY public.conversations.id;
CREATE TABLE public.custom_fonts (
    id integer NOT NULL,
    display_name character varying(64) NOT NULL,
    family character varying(64) NOT NULL,
    filename character varying(255) NOT NULL,
    format character varying(16) NOT NULL,
    size_bytes bigint DEFAULT 0 NOT NULL,
    uploaded_by character varying(32) DEFAULT NULL::character varying,
    enabled boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT custom_fonts_format_known CHECK (((format)::text = ANY ((ARRAY['woff2'::character varying, 'woff'::character varying, 'ttf'::character varying, 'otf'::character varying])::text[])))
);
CREATE SEQUENCE public.custom_fonts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.custom_fonts_id_seq OWNED BY public.custom_fonts.id;
CREATE TABLE public.direct_messages (
    id integer NOT NULL,
    conversation_id integer NOT NULL,
    sender_id integer NOT NULL,
    content text NOT NULL,
    is_read boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone
);
CREATE SEQUENCE public.direct_messages_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.direct_messages_id_seq OWNED BY public.direct_messages.id;
CREATE TABLE public.discussions (
    id integer NOT NULL,
    post_id integer NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    reactions_enabled boolean DEFAULT true NOT NULL,
    style character varying(20) DEFAULT 'threaded'::character varying NOT NULL
);
CREATE SEQUENCE public.discussions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.discussions_id_seq OWNED BY public.discussions.id;
CREATE TABLE public.dm_blocks (
    blocker_id integer NOT NULL,
    blocked_id integer NOT NULL
);
CREATE TABLE public.dm_reactions (
    message_id integer NOT NULL,
    user_id integer NOT NULL,
    reaction character varying(32) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.email_digest_queue (
    id integer NOT NULL,
    user_id integer NOT NULL,
    summary character varying(300) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE SEQUENCE public.email_digest_queue_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.email_digest_queue_id_seq OWNED BY public.email_digest_queue.id;
CREATE TABLE public.email_preferences (
    user_id integer NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    on_direct_message boolean DEFAULT true NOT NULL,
    on_new_follower boolean DEFAULT true NOT NULL,
    on_followed_post boolean DEFAULT true NOT NULL,
    on_post_published boolean DEFAULT false NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.email_send_log (
    user_id integer NOT NULL,
    sent_on date NOT NULL,
    sent integer DEFAULT 0 NOT NULL
);
CREATE TABLE public.email_tokens (
    id integer NOT NULL,
    user_id integer NOT NULL,
    token_hash character varying(64) NOT NULL,
    purpose character varying(32) NOT NULL,
    email character varying(255) NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    used_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT email_tokens_purpose_known CHECK (((purpose)::text = ANY ((ARRAY['verify_email'::character varying, 'password_reset'::character varying])::text[])))
);
CREATE SEQUENCE public.email_tokens_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.email_tokens_id_seq OWNED BY public.email_tokens.id;
CREATE TABLE public.follows (
    follower_id integer NOT NULL,
    followed_id integer NOT NULL
);
CREATE TABLE public.group_conversation_members (
    group_id integer NOT NULL,
    user_id integer NOT NULL,
    is_admin boolean DEFAULT false NOT NULL,
    joined_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.group_conversations (
    id integer NOT NULL,
    name character varying(100) DEFAULT 'Group'::character varying NOT NULL,
    created_by integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE SEQUENCE public.group_conversations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.group_conversations_id_seq OWNED BY public.group_conversations.id;
CREATE TABLE public.group_message_reactions (
    message_id integer NOT NULL,
    user_id integer NOT NULL,
    reaction character varying(32) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.group_message_read (
    group_id integer NOT NULL,
    user_id integer NOT NULL,
    last_read_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.group_messages (
    id integer NOT NULL,
    group_id integer NOT NULL,
    sender_id integer NOT NULL,
    content text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone
);
CREATE SEQUENCE public.group_messages_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.group_messages_id_seq OWNED BY public.group_messages.id;
CREATE TABLE public.hashtags (
    id integer NOT NULL,
    tag character varying(100) NOT NULL
);
CREATE SEQUENCE public.hashtags_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.hashtags_id_seq OWNED BY public.hashtags.id;
CREATE TABLE public.invite_codes (
    code character varying(128) NOT NULL,
    created_by integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '24:00:00'::interval) NOT NULL,
    used_by character varying(100) DEFAULT NULL::character varying,
    used_at timestamp with time zone
);
CREATE TABLE public.notifications (
    id integer NOT NULL,
    recipient_id integer NOT NULL,
    type character varying(32) NOT NULL,
    actor_username character varying(32) NOT NULL,
    post_id integer,
    comment_id integer,
    is_read boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    message text
);
CREATE SEQUENCE public.notifications_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.notifications_id_seq OWNED BY public.notifications.id;
CREATE TABLE public.post_hashtags (
    post_id integer NOT NULL,
    hashtag_id integer NOT NULL
);
CREATE TABLE public.post_reactions (
    post_id integer NOT NULL,
    user_id integer NOT NULL,
    reaction character varying(20) NOT NULL
);
CREATE TABLE public.post_reports (
    id integer NOT NULL,
    post_id integer NOT NULL,
    reporter_id integer,
    reason character varying(32) NOT NULL,
    details character varying(1000) DEFAULT NULL::character varying,
    status character varying(16) DEFAULT 'open'::character varying NOT NULL,
    resolved_by character varying(32) DEFAULT NULL::character varying,
    resolved_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT post_reports_status_known CHECK (((status)::text = ANY ((ARRAY['open'::character varying, 'resolved'::character varying, 'dismissed'::character varying])::text[])))
);
CREATE SEQUENCE public.post_reports_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.post_reports_id_seq OWNED BY public.post_reports.id;
CREATE TABLE public.post_uploads (
    post_id integer NOT NULL,
    upload_id integer NOT NULL
);
CREATE TABLE public.post_view_totals (
    post_id integer NOT NULL,
    total_views bigint DEFAULT 0 NOT NULL,
    unique_views bigint DEFAULT 0 NOT NULL
);
CREATE TABLE public.post_views (
    post_id integer NOT NULL,
    user_id integer NOT NULL,
    ip_hash character varying(64),
    viewed_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.post_votes (
    post_id integer NOT NULL,
    user_id integer NOT NULL,
    vote smallint NOT NULL,
    CONSTRAINT post_votes_vote_check CHECK ((vote = ANY (ARRAY[1, '-1'::integer])))
);
CREATE TABLE public.posts (
    id integer NOT NULL,
    title character varying(255) NOT NULL,
    description text NOT NULL,
    published boolean NOT NULL,
    date timestamp with time zone DEFAULT now() NOT NULL,
    edited_at timestamp with time zone,
    background_pattern character varying(2000) DEFAULT NULL::character varying,
    folder character varying(100) DEFAULT NULL::character varying,
    sort_order integer DEFAULT 0 NOT NULL,
    slug character varying(80) DEFAULT NULL::character varying
);
CREATE SEQUENCE public.posts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.posts_id_seq OWNED BY public.posts.id;
CREATE TABLE public.role_limits (
    role character varying(20) NOT NULL,
    max_storage_bytes bigint DEFAULT 52428800 NOT NULL,
    max_posts_per_day integer DEFAULT 20 NOT NULL
);
CREATE TABLE public.system_settings (
    key character varying(64) NOT NULL,
    value character varying(256) NOT NULL
);
CREATE TABLE public.upload_variants (
    id integer NOT NULL,
    upload_id integer NOT NULL,
    filename character varying(255) NOT NULL,
    width integer NOT NULL,
    size_bytes bigint DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT upload_variants_width_positive CHECK ((width > 0))
);
CREATE SEQUENCE public.upload_variants_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.upload_variants_id_seq OWNED BY public.upload_variants.id;
CREATE TABLE public.uploads (
    id integer NOT NULL,
    filename character varying(255) NOT NULL,
    user_id integer NOT NULL,
    original_name character varying(255) DEFAULT NULL::character varying,
    size_bytes bigint DEFAULT 0 NOT NULL,
    uploaded_at timestamp with time zone DEFAULT now() NOT NULL,
    width integer,
    height integer
);
CREATE SEQUENCE public.uploads_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.uploads_id_seq OWNED BY public.uploads.id;
CREATE TABLE public.users (
    id integer NOT NULL,
    username character varying(32) NOT NULL,
    password text NOT NULL,
    email character varying(255) DEFAULT NULL::character varying,
    registration_date timestamp with time zone DEFAULT now() NOT NULL,
    background_pattern character varying(2000) DEFAULT NULL::character varying,
    is_admin boolean DEFAULT false NOT NULL,
    role character varying(20) DEFAULT 'user'::character varying NOT NULL,
    pattern_presets text DEFAULT '{}'::text,
    last_visited timestamp with time zone,
    last_active_at timestamp with time zone,
    bio character varying(500) DEFAULT NULL::character varying,
    bio_links text,
    pinned_post_id integer,
    avatar_path character varying(500) DEFAULT NULL::character varying,
    email_verified boolean DEFAULT false NOT NULL,
    email_verified_at timestamp with time zone,
    unsubscribe_token character varying(64) DEFAULT NULL::character varying,
    site_background character varying(2000) DEFAULT NULL::character varying,
    header_path character varying(500) DEFAULT NULL::character varying,
    header_ink character varying(8) DEFAULT 'auto'::character varying NOT NULL,
    code_font character varying(32) DEFAULT 'default'::character varying NOT NULL,
    code_font_size smallint DEFAULT 13 NOT NULL,
    page_theme character varying(4000) DEFAULT NULL::character varying
);
CREATE SEQUENCE public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;
CREATE TABLE public.users_posts_junctions (
    id integer NOT NULL,
    post_id integer NOT NULL,
    user_id integer NOT NULL
);
CREATE SEQUENCE public.users_posts_junctions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.users_posts_junctions_id_seq OWNED BY public.users_posts_junctions.id;
ALTER TABLE ONLY public.activity_deletions ALTER COLUMN id SET DEFAULT nextval('public.activity_deletions_id_seq'::regclass);
ALTER TABLE ONLY public.comments ALTER COLUMN id SET DEFAULT nextval('public.comments_id_seq'::regclass);
ALTER TABLE ONLY public.conversations ALTER COLUMN id SET DEFAULT nextval('public.conversations_id_seq'::regclass);
ALTER TABLE ONLY public.custom_fonts ALTER COLUMN id SET DEFAULT nextval('public.custom_fonts_id_seq'::regclass);
ALTER TABLE ONLY public.direct_messages ALTER COLUMN id SET DEFAULT nextval('public.direct_messages_id_seq'::regclass);
ALTER TABLE ONLY public.discussions ALTER COLUMN id SET DEFAULT nextval('public.discussions_id_seq'::regclass);
ALTER TABLE ONLY public.email_digest_queue ALTER COLUMN id SET DEFAULT nextval('public.email_digest_queue_id_seq'::regclass);
ALTER TABLE ONLY public.email_tokens ALTER COLUMN id SET DEFAULT nextval('public.email_tokens_id_seq'::regclass);
ALTER TABLE ONLY public.group_conversations ALTER COLUMN id SET DEFAULT nextval('public.group_conversations_id_seq'::regclass);
ALTER TABLE ONLY public.group_messages ALTER COLUMN id SET DEFAULT nextval('public.group_messages_id_seq'::regclass);
ALTER TABLE ONLY public.hashtags ALTER COLUMN id SET DEFAULT nextval('public.hashtags_id_seq'::regclass);
ALTER TABLE ONLY public.notifications ALTER COLUMN id SET DEFAULT nextval('public.notifications_id_seq'::regclass);
ALTER TABLE ONLY public.post_reports ALTER COLUMN id SET DEFAULT nextval('public.post_reports_id_seq'::regclass);
ALTER TABLE ONLY public.posts ALTER COLUMN id SET DEFAULT nextval('public.posts_id_seq'::regclass);
ALTER TABLE ONLY public.upload_variants ALTER COLUMN id SET DEFAULT nextval('public.upload_variants_id_seq'::regclass);
ALTER TABLE ONLY public.uploads ALTER COLUMN id SET DEFAULT nextval('public.uploads_id_seq'::regclass);
ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);
ALTER TABLE ONLY public.users_posts_junctions ALTER COLUMN id SET DEFAULT nextval('public.users_posts_junctions_id_seq'::regclass);
ALTER TABLE ONLY public.activity_deletions
    ADD CONSTRAINT activity_deletions_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.comment_reactions
    ADD CONSTRAINT comment_reactions_pkey PRIMARY KEY (comment_id, user_id, reaction);
ALTER TABLE ONLY public.comment_votes
    ADD CONSTRAINT comment_votes_pkey PRIMARY KEY (comment_id, user_id);
ALTER TABLE ONLY public.comments
    ADD CONSTRAINT comments_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_user1_id_user2_id_key UNIQUE (user1_id, user2_id);
ALTER TABLE ONLY public.custom_fonts
    ADD CONSTRAINT custom_fonts_family_key UNIQUE (family);
ALTER TABLE ONLY public.custom_fonts
    ADD CONSTRAINT custom_fonts_filename_key UNIQUE (filename);
ALTER TABLE ONLY public.custom_fonts
    ADD CONSTRAINT custom_fonts_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.direct_messages
    ADD CONSTRAINT direct_messages_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.discussions
    ADD CONSTRAINT discussions_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.discussions
    ADD CONSTRAINT discussions_post_id_key UNIQUE (post_id);
ALTER TABLE ONLY public.dm_blocks
    ADD CONSTRAINT dm_blocks_pkey PRIMARY KEY (blocker_id, blocked_id);
ALTER TABLE ONLY public.dm_reactions
    ADD CONSTRAINT dm_reactions_pkey PRIMARY KEY (message_id, user_id, reaction);
ALTER TABLE ONLY public.email_digest_queue
    ADD CONSTRAINT email_digest_queue_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.email_preferences
    ADD CONSTRAINT email_preferences_pkey PRIMARY KEY (user_id);
ALTER TABLE ONLY public.email_send_log
    ADD CONSTRAINT email_send_log_pkey PRIMARY KEY (user_id, sent_on);
ALTER TABLE ONLY public.email_tokens
    ADD CONSTRAINT email_tokens_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.email_tokens
    ADD CONSTRAINT email_tokens_token_hash_key UNIQUE (token_hash);
ALTER TABLE ONLY public.follows
    ADD CONSTRAINT follows_pkey PRIMARY KEY (follower_id, followed_id);
ALTER TABLE ONLY public.group_conversation_members
    ADD CONSTRAINT group_conversation_members_pkey PRIMARY KEY (group_id, user_id);
ALTER TABLE ONLY public.group_conversations
    ADD CONSTRAINT group_conversations_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.group_message_reactions
    ADD CONSTRAINT group_message_reactions_pkey PRIMARY KEY (message_id, user_id, reaction);
ALTER TABLE ONLY public.group_message_read
    ADD CONSTRAINT group_message_read_pkey PRIMARY KEY (group_id, user_id);
ALTER TABLE ONLY public.group_messages
    ADD CONSTRAINT group_messages_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.hashtags
    ADD CONSTRAINT hashtags_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.hashtags
    ADD CONSTRAINT hashtags_tag_key UNIQUE (tag);
ALTER TABLE ONLY public.invite_codes
    ADD CONSTRAINT invite_codes_pkey PRIMARY KEY (code);
ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.post_hashtags
    ADD CONSTRAINT post_hashtags_pkey PRIMARY KEY (post_id, hashtag_id);
ALTER TABLE ONLY public.post_reactions
    ADD CONSTRAINT post_reactions_pkey PRIMARY KEY (post_id, user_id, reaction);
ALTER TABLE ONLY public.post_reports
    ADD CONSTRAINT post_reports_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.post_uploads
    ADD CONSTRAINT post_uploads_pkey PRIMARY KEY (post_id, upload_id);
ALTER TABLE ONLY public.post_view_totals
    ADD CONSTRAINT post_view_totals_pkey PRIMARY KEY (post_id);
ALTER TABLE ONLY public.post_views
    ADD CONSTRAINT post_views_pkey PRIMARY KEY (post_id, user_id) DEFERRABLE;
ALTER TABLE ONLY public.post_votes
    ADD CONSTRAINT post_votes_pkey PRIMARY KEY (post_id, user_id);
ALTER TABLE ONLY public.posts
    ADD CONSTRAINT posts_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.role_limits
    ADD CONSTRAINT role_limits_pkey PRIMARY KEY (role);
ALTER TABLE ONLY public.system_settings
    ADD CONSTRAINT system_settings_pkey PRIMARY KEY (key);
ALTER TABLE ONLY public.upload_variants
    ADD CONSTRAINT upload_variants_filename_key UNIQUE (filename);
ALTER TABLE ONLY public.upload_variants
    ADD CONSTRAINT upload_variants_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.uploads
    ADD CONSTRAINT uploads_filename_key UNIQUE (filename);
ALTER TABLE ONLY public.uploads
    ADD CONSTRAINT uploads_pkey PRIMARY KEY (id);
ALTER TABLE public.users
    ADD CONSTRAINT users_code_font_size_sane CHECK (((code_font_size >= 10) AND (code_font_size <= 24))) NOT VALID;
ALTER TABLE public.users
    ADD CONSTRAINT users_header_ink_known CHECK (((header_ink)::text = ANY ((ARRAY['auto'::character varying, 'light'::character varying, 'dark'::character varying])::text[]))) NOT VALID;
ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.users_posts_junctions
    ADD CONSTRAINT users_posts_junctions_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.users_posts_junctions
    ADD CONSTRAINT users_posts_junctions_post_id_user_id_key UNIQUE (post_id, user_id);
ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_username_key UNIQUE (username);
CREATE INDEX idx_activity_del_user ON public.activity_deletions USING btree (user_id, deleted_at DESC);
CREATE INDEX idx_comments_discussion ON public.comments USING btree (discussion_id);
CREATE INDEX idx_comments_parent ON public.comments USING btree (parent_id);
CREATE INDEX idx_custom_fonts_enabled ON public.custom_fonts USING btree (enabled, display_name);
CREATE INDEX idx_direct_messages_conv ON public.direct_messages USING btree (conversation_id, created_at);
CREATE INDEX idx_dm_blocks_blocked ON public.dm_blocks USING btree (blocked_id);
CREATE INDEX idx_dm_blocks_blocker ON public.dm_blocks USING btree (blocker_id);
CREATE INDEX idx_dm_conv_unread ON public.direct_messages USING btree (conversation_id, sender_id, is_read) WHERE (is_read = false);
CREATE INDEX idx_dm_reactions_msg ON public.dm_reactions USING btree (message_id);
CREATE INDEX idx_email_digest_user ON public.email_digest_queue USING btree (user_id, created_at);
CREATE INDEX idx_email_tokens_expires ON public.email_tokens USING btree (expires_at);
CREATE INDEX idx_email_tokens_user ON public.email_tokens USING btree (user_id, purpose);
CREATE INDEX idx_follows_followed ON public.follows USING btree (followed_id);
CREATE INDEX idx_follows_follower ON public.follows USING btree (follower_id);
CREATE INDEX idx_group_members_user ON public.group_conversation_members USING btree (user_id);
CREATE INDEX idx_group_messages_group ON public.group_messages USING btree (group_id, created_at);
CREATE INDEX idx_group_msg_reactions_msg ON public.group_message_reactions USING btree (message_id);
CREATE INDEX idx_invite_codes_valid ON public.invite_codes USING btree (code, expires_at) WHERE (used_by IS NULL);
CREATE INDEX idx_notif_read ON public.notifications USING btree (recipient_id, is_read);
CREATE INDEX idx_notif_recipient ON public.notifications USING btree (recipient_id, created_at DESC);
CREATE INDEX idx_notifications_recipient ON public.notifications USING btree (recipient_id, created_at DESC);
CREATE INDEX idx_post_hashtags_hashtag ON public.post_hashtags USING btree (hashtag_id);
CREATE INDEX idx_post_reports_status ON public.post_reports USING btree (status, created_at DESC);
CREATE UNIQUE INDEX idx_post_reports_unique_reporter ON public.post_reports USING btree (post_id, reporter_id) WHERE (reporter_id IS NOT NULL);
CREATE INDEX idx_posts_date ON public.posts USING btree (date DESC);
CREATE INDEX idx_posts_published ON public.posts USING btree (published);
CREATE INDEX idx_posts_slug_lower ON public.posts USING btree (lower((slug)::text)) WHERE (slug IS NOT NULL);
CREATE INDEX idx_posts_sort_order ON public.posts USING btree (sort_order);
CREATE INDEX idx_posts_title_trgm ON public.posts USING gin (title public.gin_trgm_ops) WHERE (published = true);
CREATE INDEX idx_reactions_post ON public.post_reactions USING btree (post_id);
CREATE INDEX idx_upj_post_id ON public.users_posts_junctions USING btree (post_id);
CREATE INDEX idx_upj_user_id ON public.users_posts_junctions USING btree (user_id);
CREATE INDEX idx_upload_variants_upload ON public.upload_variants USING btree (upload_id, width);
CREATE INDEX idx_uploads_user ON public.uploads USING btree (user_id);
CREATE UNIQUE INDEX idx_users_unsubscribe_token ON public.users USING btree (unsubscribe_token) WHERE (unsubscribe_token IS NOT NULL);
CREATE INDEX idx_users_username_lower ON public.users USING btree (lower((username)::text));
ALTER TABLE ONLY public.activity_deletions
    ADD CONSTRAINT activity_deletions_user_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.comment_reactions
    ADD CONSTRAINT comment_reactions_comment_fk FOREIGN KEY (comment_id) REFERENCES public.comments(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.comment_reactions
    ADD CONSTRAINT comment_reactions_user_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.comment_votes
    ADD CONSTRAINT comment_votes_comment_fk FOREIGN KEY (comment_id) REFERENCES public.comments(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.comment_votes
    ADD CONSTRAINT comment_votes_user_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.comments
    ADD CONSTRAINT comments_discussion_fk FOREIGN KEY (discussion_id) REFERENCES public.discussions(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.comments
    ADD CONSTRAINT comments_parent_fk FOREIGN KEY (parent_id) REFERENCES public.comments(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.comments
    ADD CONSTRAINT comments_user_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_user1_id_fkey FOREIGN KEY (user1_id) REFERENCES public.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_user2_id_fkey FOREIGN KEY (user2_id) REFERENCES public.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.direct_messages
    ADD CONSTRAINT direct_messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.direct_messages
    ADD CONSTRAINT direct_messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES public.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.discussions
    ADD CONSTRAINT discussions_post_fk FOREIGN KEY (post_id) REFERENCES public.posts(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.dm_blocks
    ADD CONSTRAINT dm_blocks_blocked_fk FOREIGN KEY (blocked_id) REFERENCES public.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.dm_blocks
    ADD CONSTRAINT dm_blocks_blocker_fk FOREIGN KEY (blocker_id) REFERENCES public.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.dm_reactions
    ADD CONSTRAINT dm_reactions_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.direct_messages(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.dm_reactions
    ADD CONSTRAINT dm_reactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.email_digest_queue
    ADD CONSTRAINT email_digest_queue_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.email_preferences
    ADD CONSTRAINT email_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.email_send_log
    ADD CONSTRAINT email_send_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.email_tokens
    ADD CONSTRAINT email_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.follows
    ADD CONSTRAINT follows_followed_fk FOREIGN KEY (followed_id) REFERENCES public.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.follows
    ADD CONSTRAINT follows_follower_fk FOREIGN KEY (follower_id) REFERENCES public.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.group_conversation_members
    ADD CONSTRAINT group_conversation_members_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.group_conversations(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.group_conversation_members
    ADD CONSTRAINT group_conversation_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.group_conversations
    ADD CONSTRAINT group_conversations_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.group_message_reactions
    ADD CONSTRAINT group_message_reactions_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.group_messages(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.group_message_reactions
    ADD CONSTRAINT group_message_reactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.group_message_read
    ADD CONSTRAINT group_message_read_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.group_conversations(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.group_message_read
    ADD CONSTRAINT group_message_read_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.group_messages
    ADD CONSTRAINT group_messages_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.group_conversations(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.group_messages
    ADD CONSTRAINT group_messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES public.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.invite_codes
    ADD CONSTRAINT invite_codes_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_recipient_fk FOREIGN KEY (recipient_id) REFERENCES public.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.post_hashtags
    ADD CONSTRAINT post_hashtags_hashtag_id_fkey FOREIGN KEY (hashtag_id) REFERENCES public.hashtags(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.post_hashtags
    ADD CONSTRAINT post_hashtags_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.posts(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.post_reactions
    ADD CONSTRAINT post_reactions_post_fk FOREIGN KEY (post_id) REFERENCES public.posts(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.post_reactions
    ADD CONSTRAINT post_reactions_user_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.post_reports
    ADD CONSTRAINT post_reports_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.posts(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.post_reports
    ADD CONSTRAINT post_reports_reporter_id_fkey FOREIGN KEY (reporter_id) REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.post_uploads
    ADD CONSTRAINT post_uploads_post_fk FOREIGN KEY (post_id) REFERENCES public.posts(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.post_uploads
    ADD CONSTRAINT post_uploads_upload_fk FOREIGN KEY (upload_id) REFERENCES public.uploads(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.post_view_totals
    ADD CONSTRAINT post_view_totals_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.posts(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.post_views
    ADD CONSTRAINT post_views_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.posts(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.post_views
    ADD CONSTRAINT post_views_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.post_votes
    ADD CONSTRAINT post_votes_post_fk FOREIGN KEY (post_id) REFERENCES public.posts(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.post_votes
    ADD CONSTRAINT post_votes_user_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.users_posts_junctions
    ADD CONSTRAINT upj_post_fk FOREIGN KEY (post_id) REFERENCES public.posts(id);
ALTER TABLE ONLY public.users_posts_junctions
    ADD CONSTRAINT upj_user_fk FOREIGN KEY (user_id) REFERENCES public.users(id);
ALTER TABLE ONLY public.upload_variants
    ADD CONSTRAINT upload_variants_upload_id_fkey FOREIGN KEY (upload_id) REFERENCES public.uploads(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.uploads
    ADD CONSTRAINT uploads_user_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

-- ── Seed data ──────────────────────────────────────────────────────────────

INSERT INTO public.role_limits VALUES ('user', 52428800, 20);
INSERT INTO public.role_limits VALUES ('trusted', 524288000, 100);
INSERT INTO public.role_limits VALUES ('restricted', 5242880, 2);
INSERT INTO public.role_limits VALUES ('frozen', 0, 0);
INSERT INTO public.role_limits VALUES ('admin', 524288000, -1);
INSERT INTO public.system_settings VALUES ('max_daily_registrations', '5');
