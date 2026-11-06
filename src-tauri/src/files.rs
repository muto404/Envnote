use crate::dotenv::ParsedDocument;
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::{
    fs::{self, OpenOptions, Permissions},
    io::{self, Write},
    path::{Path, PathBuf},
    process::{Command, Output, Stdio},
};
use tempfile::NamedTempFile;

const CONFLICT: &str = "文件已在外部修改。请刷新后再保存。";
const TEMPLATE: &str = "此模板可用于查找变量名。";
const READ_ONLY: &str = "文件为只读。请检查文件权限。";
const WRITE_ERROR: &str = "无法写入文件。请检查路径和文件权限。";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(test, derive(Debug))]
pub struct Document {
    pub path: String,
    pub revision: String,
    pub entries: Vec<crate::dotenv::Entry>,
    pub missing: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub read_only_reason: Option<String>,
}

pub fn inspect_project(directory: &Path) -> Result<Vec<String>, String> {
    let directory = directory
        .canonicalize()
        .map_err(|_| "无法打开所选文件夹。请检查它是否仍在原位置。")?;
    let entries = fs::read_dir(directory).map_err(|_| "无法读取所选文件夹。请检查访问权限。")?;
    let mut candidates = Vec::new();
    for entry in entries {
        let entry = entry.map_err(|_| "无法读取所选文件夹中的一项内容。请检查访问权限。")?;
        let name = entry.file_name();
        let Some(name) = name.to_str().filter(|name| env_filename(name)) else {
            continue;
        };
        let file_type = entry
            .file_type()
            .map_err(|_| "无法检查一个候选文件。请检查文件权限。")?;
        if file_type.is_file() {
            let priority = if name.eq_ignore_ascii_case(".env") {
                0
            } else if name.eq_ignore_ascii_case(".env.local") {
                1
            } else if is_template(name) {
                3
            } else {
                2
            };
            candidates.push((priority, utf8_path(&entry.path())?));
        }
    }
    candidates.sort_unstable();
    Ok(candidates.into_iter().map(|(_, path)| path).collect())
}

pub fn read_document(path: &Path) -> Result<Document, String> {
    let snapshot = Snapshot::load(path)?;
    let parsed = snapshot.text().and_then(ParsedDocument::parse);
    let read_only_reason = parsed
        .as_ref()
        .err()
        .cloned()
        .or_else(|| snapshot.read_only_reason().map(str::to_owned));
    Ok(Document {
        path: utf8_path(&snapshot.path)?,
        revision: snapshot.revision(),
        entries: parsed.map_or_else(|_| Vec::new(), |parsed| parsed.entries()),
        missing: snapshot.bytes.is_none(),
        read_only_reason,
    })
}

pub fn save_document(
    path: &Path,
    expected_revision: &str,
    entries: &[crate::dotenv::Entry],
) -> Result<Document, String> {
    let snapshot = Snapshot::load(path)?;
    if snapshot.revision() != expected_revision {
        return Err(CONFLICT.into());
    }
    if let Some(reason) = snapshot.read_only_reason() {
        return Err(reason.into());
    }

    let output_path = utf8_path(&snapshot.path)?;
    let source = snapshot.text()?;
    let rendered = ParsedDocument::parse(source)?.patch(entries)?;
    let saved = ParsedDocument::parse(&rendered)?.entries();
    let bytes = rendered.as_bytes();
    if snapshot.bytes.as_deref() != Some(bytes) {
        if snapshot.permissions.is_some() {
            // Honor file access restrictions even when its parent directory allows a rename.
            OpenOptions::new()
                .write(true)
                .open(&snapshot.path)
                .map_err(|_| WRITE_ERROR)?;
        }
        let replacement = prepare_replacement(&snapshot.path, bytes, snapshot.permissions.clone())
            .map_err(|_| WRITE_ERROR)?;
        let latest = Snapshot::load(path).map_err(|_| CONFLICT)?;
        if latest.revision() != expected_revision || latest.permissions != snapshot.permissions {
            return Err(CONFLICT.into());
        }
        if snapshot.bytes.is_none() {
            replacement
                .persist_noclobber(&snapshot.path)
                .map_err(|error| {
                    if error.error.kind() == io::ErrorKind::AlreadyExists {
                        CONFLICT
                    } else {
                        WRITE_ERROR
                    }
                })?;
        } else {
            replacement
                .persist(&snapshot.path)
                .map_err(|_| WRITE_ERROR)?;
        }
    }
    Ok(Document {
        path: output_path,
        revision: revision(&snapshot.path, Some(bytes)),
        entries: saved,
        missing: false,
        read_only_reason: None,
    })
}

struct Snapshot {
    path: PathBuf,
    bytes: Option<Vec<u8>>,
    permissions: Option<Permissions>,
}

impl Snapshot {
    fn load(path: &Path) -> Result<Self, String> {
        let path = normalize_path(path)?;
        let permissions = match fs::symlink_metadata(&path) {
            Ok(metadata) if metadata.is_file() => Some(metadata.permissions()),
            Ok(metadata) if metadata.is_symlink() => {
                return Err("请选择此符号链接指向的实际 .env 文件。".into());
            }
            Ok(_) => return Err("请选择一个普通的 .env 文件。".into()),
            Err(error) if error.kind() == io::ErrorKind::NotFound => None,
            Err(_) => return Err("无法检查文件。请确认路径和文件权限。".into()),
        };
        let bytes = if permissions.is_some() {
            Some(fs::read(&path).map_err(|_| "无法读取文件。请确认路径和文件权限。")?)
        } else {
            None
        };
        Ok(Self {
            path,
            bytes,
            permissions,
        })
    }

    fn revision(&self) -> String {
        revision(&self.path, self.bytes.as_deref())
    }

    fn text(&self) -> Result<&str, String> {
        std::str::from_utf8(self.bytes.as_deref().unwrap_or_default())
            .map_err(|_| "此文件的编码不是 UTF-8。请转换编码后再编辑。".into())
    }

    fn read_only_reason(&self) -> Option<&'static str> {
        if self
            .path
            .file_name()
            .and_then(|name| name.to_str())
            .is_some_and(is_template)
        {
            Some(TEMPLATE)
        } else if self.permissions.as_ref().is_some_and(Permissions::readonly) {
            Some(READ_ONLY)
        } else {
            None
        }
    }
}

fn normalize_path(path: &Path) -> Result<PathBuf, String> {
    if !path.is_absolute() {
        return Err("请选择 .env 文件的完整路径。".into());
    }
    let name = path
        .file_name()
        .and_then(|name| name.to_str())
        .filter(|name| env_filename(name))
        .ok_or("请选择名为 .env 或以 .env. 开头的文件。")?;
    let parent = path
        .parent()
        .and_then(|parent| parent.canonicalize().ok())
        .filter(|parent| parent.is_dir())
        .ok_or("找不到文件所在的文件夹。请检查路径。")?;
    Ok(parent.join(name))
}

fn utf8_path(path: &Path) -> Result<String, String> {
    path.to_str()
        .map(str::to_owned)
        .ok_or_else(|| "请选择文件名和文件夹名采用 UTF-8 编码的路径。".into())
}

fn env_filename(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    lower == ".env"
        || lower
            .strip_prefix(".env.")
            .is_some_and(|suffix| !suffix.is_empty())
}

fn is_template(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    [".example", ".sample", ".template", ".dist"]
        .iter()
        .any(|suffix| lower.ends_with(suffix))
}

fn revision(path: &Path, bytes: Option<&[u8]>) -> String {
    let mut digest = Sha256::new();
    digest.update(path.as_os_str().as_encoded_bytes());
    digest.update([0, u8::from(bytes.is_some())]);
    if let Some(bytes) = bytes {
        digest.update(bytes);
    }
    format!("{:x}", digest.finalize())
}

pub(crate) fn prepare_replacement(
    path: &Path,
    contents: &[u8],
    permissions: Option<Permissions>,
) -> io::Result<NamedTempFile> {
    let parent = path
        .parent()
        .ok_or_else(|| io::Error::from(io::ErrorKind::InvalidInput))?;
    let mut replacement = tempfile::Builder::new()
        .prefix(".envnote-")
        .tempfile_in(parent)?;
    replacement.write_all(contents)?;
    if let Some(permissions) = permissions {
        replacement.as_file().set_permissions(permissions)?;
    }
    replacement.as_file().sync_all()?;
    Ok(replacement)
}

#[derive(Default, Serialize)]
pub struct GitStatus {
    pub tracked: bool,
    pub ignored: bool,
    pub available: bool,
}

pub fn git_status(path: &Path) -> GitStatus {
    git_status_for_path(path).unwrap_or_default()
}

fn git_status_for_path(path: &Path) -> Option<GitStatus> {
    let path = normalize_path(path).ok()?;
    let parent = path.parent()?;
    let name = path.file_name()?.to_str()?;
    let repo = git(parent, &["rev-parse", "--is-inside-work-tree"])?;
    if !repo.status.success() || repo.stdout != b"true\n" {
        return None;
    }
    let tracked = git(
        parent,
        &[
            "--literal-pathspecs",
            "ls-files",
            "--error-unmatch",
            "--",
            name,
        ],
    )?;
    let ignored = git(parent, &["check-ignore", "--no-index", "-q", "--", name])?;
    match (tracked.status.code(), ignored.status.code()) {
        (Some(tracked @ (0 | 1)), Some(ignored @ (0 | 1))) => Some(GitStatus {
            tracked: tracked == 0,
            ignored: ignored == 0,
            available: true,
        }),
        _ => None,
    }
}

fn git(directory: &Path, args: &[&str]) -> Option<Output> {
    Command::new("git")
        .arg("-C")
        .arg(directory)
        .args(args)
        .env_remove("GIT_DIR")
        .env_remove("GIT_WORK_TREE")
        .env_remove("GIT_INDEX_FILE")
        .stdin(Stdio::null())
        .stderr(Stdio::null())
        .output()
        .ok()
}
