use crate::models::SmartRules;
use parking_lot::RwLock;
use std::fs;
use std::path::PathBuf;
use std::sync::Arc;

pub struct RulesManager {
    rules_path: PathBuf,
    current_rules: Arc<RwLock<SmartRules>>,
}

impl RulesManager {
    pub fn new() -> Self {
        let appdata = dirs::data_dir().unwrap_or_else(|| PathBuf::from("."));
        let rules_dir = appdata.join("smart-notify");
        let _ = fs::create_dir_all(&rules_dir);
        let rules_path = rules_dir.join("smart-rules.json");

        let default_rules = SmartRules::default();
        let loaded_rules = if rules_path.exists() {
            match fs::read_to_string(&rules_path) {
                Ok(content) => serde_json::from_str::<SmartRules>(&content).unwrap_or(default_rules),
                Err(_) => default_rules,
            }
        } else {
            if let Ok(serialized) = serde_json::to_string_pretty(&default_rules) {
                let _ = fs::write(&rules_path, serialized);
            }
            default_rules
        };

        Self {
            rules_path,
            current_rules: Arc::new(RwLock::new(loaded_rules)),
        }
    }

    pub fn get_rules_path(&self) -> PathBuf {
        self.rules_path.clone()
    }

    pub fn reload(&self) -> SmartRules {
        let default_rules = SmartRules::default();
        let rules = if self.rules_path.exists() {
            match fs::read_to_string(&self.rules_path) {
                Ok(content) => serde_json::from_str::<SmartRules>(&content).unwrap_or_else(|_| default_rules),
                Err(_) => default_rules,
            }
        } else {
            default_rules
        };

        let mut lock = self.current_rules.write();
        *lock = rules.clone();
        rules
    }

    pub fn get_rules(&self) -> SmartRules {
        self.current_rules.read().clone()
    }

    pub fn is_app_muted(&self, app_id: &str, app_name: &str) -> bool {
        let rules = self.current_rules.read();
        let app_id_lower = app_id.to_lowercase();
        let app_name_lower = app_name.to_lowercase();

        rules.muted_apps.iter().any(|muted| {
            let m = muted.to_lowercase();
            app_id_lower.contains(&m) || app_name_lower.contains(&m)
        })
    }

    pub fn contains_urgent_keyword(&self, text: &str) -> bool {
        let rules = self.current_rules.read();
        let text_lower = text.to_lowercase();

        rules.urgent_keywords.iter().any(|kw| {
            text_lower.contains(&kw.to_lowercase())
        })
    }
}
