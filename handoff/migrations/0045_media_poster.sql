-- A clip remembers the still it was generated from. Filing copies that link onto the two files.
ALTER TABLE agent_media ADD COLUMN source_media_id TEXT REFERENCES agent_media(id);

CREATE TABLE file_posters (
  file_id TEXT PRIMARY KEY REFERENCES files(id),
  poster_file_id TEXT NOT NULL REFERENCES files(id)
);
