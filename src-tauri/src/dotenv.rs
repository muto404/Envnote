use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};

#[derive(Deserialize, Serialize)]
#[cfg_attr(test, derive(Debug, PartialEq, Eq))]
pub struct Entry {
    pub key: String,
    pub value: String,
}

#[derive(Clone, Copy)]
enum Quote {
    Bare,
    Single,
    Double,
}

struct Token<'a> {
    raw: &'a str,
    value: &'a str,
    quote: Quote,
}

struct Assignment<'a> {
    key: &'a str,
    prefix: &'a str,
    token: Token<'a>,
    suffix: &'a str,
}

struct Line<'a> {
    raw: &'a str,
    assignment: Option<Assignment<'a>>,
}

pub struct ParsedDocument<'a> {
    bom: &'a str,
    lines: Vec<Line<'a>>,
    newline: &'a str,
    final_newline: bool,
}

impl<'a> ParsedDocument<'a> {
    pub fn parse(source: &'a str) -> Result<Self, String> {
        let (bom, body) = source
            .strip_prefix('\u{feff}')
            .map_or(("", source), |body| ("\u{feff}", body));
        let mut lines = Vec::new();
        let mut keys = HashSet::new();
        for (index, raw) in body.split_inclusive('\n').enumerate() {
            let assignment = parse_line(raw)
                .ok_or_else(|| format!("第 {} 行的格式暂不支持。请在原文件中编辑。", index + 1))?;
            if let Some(assignment) = &assignment {
                if !keys.insert(assignment.key) {
                    return Err(format!(
                        "第 {} 行的变量名重复。请在原文件中处理后刷新。",
                        index + 1
                    ));
                }
            }
            lines.push(Line { raw, assignment });
        }
        let newline = match body.find('\n') {
            Some(index) if body[..index].ends_with('\r') => "\r\n",
            _ => "\n",
        };
        Ok(Self {
            bom,
            lines,
            newline,
            final_newline: body.is_empty() || body.ends_with('\n'),
        })
    }

    pub fn entries(&self) -> Vec<Entry> {
        self.lines
            .iter()
            .filter_map(|line| line.assignment.as_ref())
            .map(|assignment| Entry {
                key: assignment.key.into(),
                value: assignment.token.value.into(),
            })
            .collect()
    }

    pub fn patch(&self, entries: &[Entry]) -> Result<String, String> {
        let mut desired = HashMap::new();
        for entry in entries {
            if !valid_key(&entry.key) {
                return Err(
                    "变量名请以英文字母或下划线开头，只使用英文字母、数字和下划线。".into(),
                );
            }
            if entry.value.chars().any(invalid_line_character) {
                return Err("请输入单行值，移除换行符和其他控制字符。".into());
            }
            if desired
                .insert(entry.key.as_str(), entry.value.as_str())
                .is_some()
            {
                return Err("每个变量名只能出现一次。".into());
            }
        }

        let mut result = String::from(self.bom);
        for line in &self.lines {
            let Some(assignment) = &line.assignment else {
                result.push_str(line.raw);
                continue;
            };
            let Some(value) = desired.remove(assignment.key) else {
                continue;
            };
            if value == assignment.token.value {
                result.push_str(line.raw);
            } else {
                result.push_str(assignment.prefix);
                result.push_str(&encode(value, assignment.token.quote)?);
                if assignment.suffix.starts_with('#') {
                    result.push(' ');
                }
                result.push_str(assignment.suffix);
            }
        }

        for entry in entries
            .iter()
            .filter(|entry| desired.contains_key(entry.key.as_str()))
        {
            if result.len() > self.bom.len() && !result.ends_with('\n') {
                result.push_str(self.newline);
            }
            result.push_str(&entry.key);
            result.push('=');
            result.push_str(&encode(&entry.value, Quote::Bare)?);
            if self.final_newline {
                result.push_str(self.newline);
            }
        }
        Ok(result)
    }
}

fn parse_line(raw: &str) -> Option<Option<Assignment<'_>>> {
    let content = raw
        .strip_suffix('\n')
        .map_or(raw, |line| line.strip_suffix('\r').unwrap_or(line));
    if content.chars().any(invalid_line_character) {
        return None;
    }
    let trimmed = content.trim_start_matches(horizontal_space);
    if trimmed.is_empty() || trimmed.starts_with('#') {
        return Some(None);
    }
    let binding = trimmed
        .strip_prefix("export")
        .filter(|rest| rest.starts_with(horizontal_space))
        .map_or(trimmed, |rest| rest.trim_start_matches(horizontal_space));
    let (key, after_equals) = binding.split_once('=')?;
    let key = key.trim_end_matches(horizontal_space);
    if !valid_key(key) {
        return None;
    }
    let input = after_equals.trim_start_matches(horizontal_space);
    let token = parse_token(input)?;
    let start = content.len() - input.len();
    let end = start + token.raw.len();
    Some(Some(Assignment {
        key,
        prefix: &raw[..start],
        token,
        suffix: &raw[end..],
    }))
}

fn parse_token(input: &str) -> Option<Token<'_>> {
    let quote = match input.as_bytes().first() {
        Some(b'\'') => Quote::Single,
        Some(b'"') => Quote::Double,
        Some(b'`') => return None,
        _ => {
            let value = input.split('#').next()?.trim_end_matches(horizontal_space);
            let trailing_backslashes = value
                .bytes()
                .rev()
                .take_while(|byte| *byte == b'\\')
                .count();
            if trailing_backslashes % 2 != 0 {
                return None;
            }
            return Some(Token {
                raw: value,
                value,
                quote: Quote::Bare,
            });
        }
    };
    let delimiter = input.as_bytes()[0];
    let mut escaped = false;
    for (index, byte) in input.bytes().enumerate().skip(1) {
        if !escaped && byte == delimiter {
            let rest = input[index + 1..].trim_start_matches(horizontal_space);
            return (rest.is_empty() || rest.starts_with('#')).then(|| Token {
                raw: &input[..=index],
                value: &input[1..index],
                quote,
            });
        }
        escaped = !escaped && byte == b'\\';
    }
    None
}

fn encode(value: &str, preferred: Quote) -> Result<String, String> {
    for quote in [preferred, Quote::Bare, Quote::Single, Quote::Double] {
        let rendered = match quote {
            Quote::Bare => value.to_owned(),
            Quote::Single => format!("'{value}'"),
            Quote::Double => format!("\"{value}\""),
        };
        if let Some(token) = parse_token(rendered.trim_start_matches(horizontal_space)) {
            if token.raw == rendered && token.value == value {
                return Ok(rendered);
            }
        }
    }
    Err("这个值无法安全写入一行。请在原文件中编辑。".into())
}

fn horizontal_space(character: char) -> bool {
    matches!(character, ' ' | '\t')
}

fn invalid_line_character(character: char) -> bool {
    character.is_control() && character != '\t'
}

fn valid_key(key: &str) -> bool {
    let mut bytes = key.bytes();
    matches!(bytes.next(), Some(b'A'..=b'Z' | b'a'..=b'z' | b'_'))
        && bytes.all(|byte| byte.is_ascii_alphanumeric() || byte == b'_')
}
