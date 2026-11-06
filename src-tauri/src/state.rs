use crate::files::prepare_replacement;
use serde::{Deserialize, Serialize};
use std::{collections::BTreeMap, fs, io::ErrorKind, path::Path};

const METADATA_FILE: &str = "projects.json";
const READ_ERROR: &str = "无法读取项目列表。请检查应用数据文件的权限。";
const WRITE_ERROR: &str = "无法保存项目列表。请检查应用数据文件夹的权限。";

#[derive(Debug, Default, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AppState {
    pub projects: Vec<Project>,
}

#[derive(Debug, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Project {
    pub id: String,
    pub name: String,
    pub directory: String,
    pub file_path: String,
    pub notes: BTreeMap<String, Note>,
}

#[derive(Debug, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Note {
    pub note: String,
    pub url: String,
    pub sensitive: bool,
}

pub fn load_state(directory: &Path) -> Result<AppState, String> {
    let path = directory.join(METADATA_FILE);
    match fs::symlink_metadata(&path) {
        Err(error) if error.kind() == ErrorKind::NotFound => return Ok(AppState::default()),
        Ok(metadata) if metadata.is_file() => {}
        _ => return Err(READ_ERROR.into()),
    }
    let bytes = fs::read(path).map_err(|_| READ_ERROR)?;
    serde_json::from_slice(&bytes)
        .map_err(|_| "项目列表格式有误。请检查应用数据文件中的 projects.json。".into())
}

pub fn save_state(directory: &Path, state: &AppState) -> Result<(), String> {
    let contents = serde_json::to_vec_pretty(state).map_err(|_| WRITE_ERROR)?;
    fs::create_dir_all(directory).map_err(|_| WRITE_ERROR)?;
    let path = directory.join(METADATA_FILE);
    let replacement = prepare_replacement(&path, &contents, None).map_err(|_| WRITE_ERROR)?;
    replacement.persist(&path).map_err(|_| WRITE_ERROR)?;
    Ok(())
}
