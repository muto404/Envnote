use super::{dotenv::Entry, files::*, state::*};
use std::{fs, path::Path, process::Command};
use tempfile::tempdir;

fn entry(key: &str, value: &str) -> Entry {
    Entry {
        key: key.into(),
        value: value.into(),
    }
}

#[test]
fn reads_single_line_values_as_literal_editor_text() {
    let dir = tempdir().unwrap();
    let path = dir.path().join(".env");
    fs::write(
        &path,
        "\u{feff}# Settings\r\n export  FOO = \"\\n${BAR}\"  # literal\r\nNAME='two # words'\r\nEMPTY=\r\nURL=https://example.test\r\n",
    )
    .unwrap();

    let document = read_document(&path).unwrap();
    assert!(!document.missing);
    assert!(document.read_only_reason.is_none());
    assert_eq!(
        document.entries,
        [
            entry("FOO", "\\n${BAR}"),
            entry("NAME", "two # words"),
            entry("EMPTY", ""),
            entry("URL", "https://example.test"),
        ]
    );
}

#[test]
fn patches_edited_values_without_reformatting_other_text() {
    let dir = tempdir().unwrap();
    let path = dir.path().join(".env");
    fs::write(
        &path,
        "\u{feff}# Settings\r\n\r\n export  FOO = \"old\"  # keep\r\nNAME='two # words'\r\nURL=https://example.test",
    )
    .unwrap();
    let mut document = read_document(&path).unwrap();
    document.entries[0].value = " leading # trailing ".into();

    let saved = save_document(&path, &document.revision, &document.entries).unwrap();
    assert_ne!(document.revision, saved.revision);
    assert_eq!(document.entries, saved.entries);
    assert_eq!(
        fs::read_to_string(&path).unwrap(),
        "\u{feff}# Settings\r\n\r\n export  FOO = \" leading # trailing \"  # keep\r\nNAME='two # words'\r\nURL=https://example.test"
    );
}

#[test]
fn removes_and_appends_entries_without_reordering_existing_lines() {
    let dir = tempdir().unwrap();
    let path = dir.path().join(".env.local");
    fs::write(&path, "# first\r\nA=1\r\nREMOVE=old\r\n# next\r\nB=2").unwrap();
    let document = read_document(&path).unwrap();

    let saved = save_document(
        &path,
        &document.revision,
        &[
            entry("B", "2"),
            entry("A", "1"),
            entry("ADD", "new # value"),
            entry("LAST", ""),
        ],
    )
    .unwrap();
    assert_eq!(saved.entries[2], entry("ADD", "new # value"));
    assert_eq!(
        fs::read_to_string(&path).unwrap(),
        "# first\r\nA=1\r\n# next\r\nB=2\r\nADD='new # value'\r\nLAST="
    );
}

#[test]
fn refuses_to_overwrite_edits_made_after_reading() {
    let dir = tempdir().unwrap();
    let path = dir.path().join(".env");
    fs::write(&path, "TOKEN=before\n").unwrap();
    let original = read_document(&path).unwrap();
    fs::write(&path, "TOKEN=external\n").unwrap();

    let error = save_document(&path, &original.revision, &[entry("TOKEN", "draft")]).unwrap_err();
    assert!(error.starts_with("文件已在外部修改"));
    assert_eq!(fs::read_to_string(&path).unwrap(), "TOKEN=external\n");
}

#[test]
fn refuses_to_replace_an_empty_file_created_after_reading() {
    let dir = tempdir().unwrap();
    let path = dir.path().join(".env");
    let missing = read_document(&path).unwrap();
    assert!(missing.missing);
    fs::write(&path, "").unwrap();

    assert!(save_document(&path, &missing.revision, &[entry("TOKEN", "draft")]).is_err());
    assert_eq!(fs::read(&path).unwrap(), b"");
}

#[test]
fn creates_only_the_chosen_target_when_a_template_exists() {
    let dir = tempdir().unwrap();
    let template = dir.path().join(".env.example");
    let target = dir.path().join(".env");
    fs::write(&template, "# Template\nTOKEN=placeholder\n").unwrap();
    fs::write(dir.path().join(".env.local"), "MODE=local\n").unwrap();
    fs::create_dir(dir.path().join(".env.folder")).unwrap();
    fs::write(dir.path().join("other.txt"), "").unwrap();

    let candidates = inspect_project(dir.path()).unwrap();
    let canonical = dir.path().canonicalize().unwrap();
    assert_eq!(
        candidates,
        [
            canonical.join(".env.local").to_str().unwrap(),
            canonical.join(".env.example").to_str().unwrap(),
        ]
    );
    let example = read_document(&template).unwrap();
    assert!(example.read_only_reason.is_some());
    assert_eq!(example.entries[0].key, "TOKEN");
    assert!(save_document(&template, &example.revision, &[entry("TOKEN", "fixture")]).is_err());

    let missing = read_document(&target).unwrap();
    let created = save_document(&target, &missing.revision, &[entry("TOKEN", "fixture")]).unwrap();
    assert!(!created.missing);
    assert_eq!(fs::read_to_string(&target).unwrap(), "TOKEN=fixture\n");
    assert_eq!(
        fs::read_to_string(&template).unwrap(),
        "# Template\nTOKEN=placeholder\n"
    );
}

#[test]
fn opens_unsupported_files_read_only_and_leaves_them_intact() {
    let dir = tempdir().unwrap();
    let path = dir.path().join(".env");
    for unsupported in [
        &b"KEY=one\nKEY=two\n"[..],
        &b"KEY=\"one\ntwo\"\n"[..],
        &b"KEY=one\\\ntwo\n"[..],
        &b"unset KEY\n"[..],
        &b"KEY=\xff\n"[..],
    ] {
        fs::write(&path, unsupported).unwrap();
        let document = read_document(&path).unwrap();
        assert!(document.read_only_reason.is_some());
        assert!(save_document(&path, &document.revision, &[entry("KEY", "draft")]).is_err());
        assert_eq!(fs::read(&path).unwrap(), unsupported);
    }
}

#[test]
fn rejects_malformed_drafts_before_writing() {
    let dir = tempdir().unwrap();
    let path = dir.path().join(".env");
    fs::write(&path, "A=original\n").unwrap();
    let document = read_document(&path).unwrap();
    for entries in [
        vec![entry("A", "new"), entry("A", "other")],
        vec![entry("BAD=KEY", "new")],
        vec![entry("A", "new\nB=injected")],
    ] {
        assert!(save_document(&path, &document.revision, &entries).is_err());
        assert_eq!(fs::read_to_string(&path).unwrap(), "A=original\n");
    }
}

#[cfg(unix)]
#[test]
fn preserves_permissions_and_honors_read_only_files() {
    use std::os::unix::fs::PermissionsExt;

    let dir = tempdir().unwrap();
    let path = dir.path().join(".env");
    fs::write(&path, "A=before\n").unwrap();
    fs::set_permissions(&path, fs::Permissions::from_mode(0o640)).unwrap();
    let document = read_document(&path).unwrap();
    save_document(&path, &document.revision, &[entry("A", "after")]).unwrap();
    assert_eq!(
        fs::metadata(&path).unwrap().permissions().mode() & 0o777,
        0o640
    );

    fs::set_permissions(&path, fs::Permissions::from_mode(0o400)).unwrap();
    let document = read_document(&path).unwrap();
    assert!(document.read_only_reason.is_some());
    assert!(save_document(&path, &document.revision, &[entry("A", "draft")]).is_err());
    assert_eq!(fs::read_to_string(&path).unwrap(), "A=after\n");
}

#[cfg(unix)]
#[test]
fn rejects_symbolic_link_targets() {
    use std::os::unix::fs::symlink;

    let dir = tempdir().unwrap();
    let original = dir.path().join(".env.actual");
    let link = dir.path().join(".env");
    fs::write(&original, "A=original\n").unwrap();
    symlink(&original, &link).unwrap();

    assert!(read_document(&link).is_err());
    let document = read_document(&original).unwrap();
    assert!(save_document(&link, &document.revision, &[entry("A", "draft")]).is_err());
    assert_eq!(fs::read_to_string(&original).unwrap(), "A=original\n");
    assert!(fs::symlink_metadata(&link).unwrap().is_symlink());
}

#[test]
fn keeps_shared_variable_names_and_revisions_project_specific() {
    let a = tempdir().unwrap();
    let b = tempdir().unwrap();
    let a_path = a.path().join(".env");
    let b_path = b.path().join(".env");
    fs::write(&a_path, "TOKEN=fixture\n").unwrap();
    fs::write(&b_path, "TOKEN=fixture\n").unwrap();
    let a_document = read_document(&a_path).unwrap();
    let b_document = read_document(&b_path).unwrap();

    assert!(save_document(&b_path, &a_document.revision, &[entry("TOKEN", "wrong")]).is_err());
    save_document(
        &b_path,
        &b_document.revision,
        &[entry("TOKEN", "different")],
    )
    .unwrap();
    assert_eq!(
        read_document(&a_path).unwrap().entries,
        [entry("TOKEN", "fixture")]
    );
    assert_eq!(
        read_document(&b_path).unwrap().entries,
        [entry("TOKEN", "different")]
    );
}

fn git(dir: &Path, args: &[&str]) {
    let result = Command::new("git")
        .arg("-C")
        .arg(dir)
        .args(args)
        .output()
        .unwrap();
    assert!(result.status.success(), "git {:?}", args);
}

#[test]
fn reports_git_tracking_even_with_a_matching_ignore_rule() {
    let dir = tempdir().unwrap();
    let path = dir.path().join(".env.local");
    git(dir.path(), &["init", "-q"]);
    fs::write(dir.path().join(".gitignore"), ".env*\n").unwrap();
    fs::write(&path, "A=fixture\n").unwrap();

    let untracked = git_status(&path);
    assert!(untracked.available && !untracked.tracked && untracked.ignored);
    git(dir.path(), &["add", "-f", "--", ".env.local"]);
    let tracked = git_status(&path);
    assert!(tracked.available && tracked.tracked && tracked.ignored);
}

#[test]
fn persists_project_metadata_without_an_environment_value_field() {
    let dir = tempdir().unwrap();
    let data_dir = dir.path().join("app-data");
    assert!(load_state(&data_dir).unwrap().projects.is_empty());
    let metadata = serde_json::json!({
        "projects": [{
            "id": "one",
            "name": "Fixture",
            "directory": "/somewhere",
            "filePath": "/somewhere/.env",
            "notes": {"TOKEN": {"note": "testing", "url": "https://example.test", "sensitive": true}}
        }]
    });
    let state = serde_json::from_value::<AppState>(metadata.clone()).unwrap();
    save_state(&data_dir, &state).unwrap();
    assert_eq!(load_state(&data_dir).unwrap(), state);
    let files = fs::read_dir(&data_dir)
        .unwrap()
        .collect::<Result<Vec<_>, _>>()
        .unwrap();
    assert_eq!(files.len(), 1);
    let saved: serde_json::Value =
        serde_json::from_slice(&fs::read(files[0].path()).unwrap()).unwrap();
    assert_eq!(saved, metadata);
    let mut invalid = metadata;
    invalid["projects"][0]["notes"]["TOKEN"]["value"] = "reject this".into();
    assert!(serde_json::from_value::<AppState>(invalid).is_err());
}
