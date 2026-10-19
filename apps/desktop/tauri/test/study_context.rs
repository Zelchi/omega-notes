use super::*;
use std::fs;

#[test]
fn source_cache_reuses_exact_revisions_rejects_invalid_files_and_obeys_reset() {
    // Keep the registry lifecycle in one test: clearing it intentionally invalidates all preparations.
    let directory =
        std::env::temp_dir().join(format!("omega-study-context-{}", uuid::Uuid::new_v4()));
    fs::create_dir_all(&directory).unwrap();
    struct Cleanup(PathBuf);
    impl Drop for Cleanup {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }
    let _cleanup = Cleanup(directory.clone());
    let id = uuid::Uuid::new_v4().to_string();
    let backups = directory.join("backups");
    notes::write_note(&directory, &backups, &id, "First", &notes::empty_document()).unwrap();
    let generation = REGISTRY.lock().unwrap().generation;
    let first = source(&directory, &id, generation).unwrap();
    let repeated = source(&directory, &id, generation).unwrap();
    assert!(Arc::ptr_eq(&first, &repeated));
    notes::write_note(&directory, &backups, &id, "Other", &notes::empty_document()).unwrap();
    let changed = source(&directory, &id, generation).unwrap();
    assert!(!Arc::ptr_eq(&first, &changed));
    assert_eq!(first.title, "First"); // Existing snapshots are immutable.
    assert_eq!(changed.title, "Other");
    fs::write(notes::note_path(&directory, &id), "invalid JSON").unwrap();
    assert!(source(&directory, &id, generation).is_err());
    notes::write_note(&directory, &backups, &id, "Valid", &notes::empty_document()).unwrap();
    assert_eq!(source(&directory, &id, generation).unwrap().title, "Valid");
    fs::remove_file(notes::note_path(&directory, &id)).unwrap();
    assert!(source(&directory, &id, generation).is_err());
    notes::write_note(&directory, &backups, &id, "Again", &notes::empty_document()).unwrap();
    clear();
    assert!(matches!(source(&directory, &id, generation), Err(error) if error == "AI_CANCELLED"));
    let registry = REGISTRY.lock().unwrap();
    assert!(registry.sources.is_empty());
    assert!(registry.contexts.is_empty());
}

/// Reproducible local measurement, deliberately excluded from the normal suite.
/// It measures preparation only, with warm OS page cache, not AI latency or tokens.
#[test]
#[ignore = "local timing diagnostic; run explicitly with --ignored --nocapture"]
fn measure_source_preparation_cache() {
    use std::hint::black_box;

    let directory =
        std::env::temp_dir().join(format!("omega-study-benchmark-{}", uuid::Uuid::new_v4()));
    fs::create_dir_all(&directory).unwrap();
    struct Cleanup(PathBuf);
    impl Drop for Cleanup {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }
    let _cleanup = Cleanup(directory.clone());
    let backups = directory.join("backups");
    let phrase = "A inteligência artificial reconhece padrões e relaciona conceitos.\n";
    const ITERATIONS: usize = 20;
    const ROUNDS: usize = 5;
    for target_bytes in [16 * 1024, 256 * 1024, 2 * 1024 * 1024] {
        let id = uuid::Uuid::new_v4().to_string();
        let text = phrase.repeat(target_bytes / phrase.len());
        let characters = text.chars().count();
        let mut document = notes::empty_document();
        if let notes::NoteElement::Text { text: value, .. } = &mut document.elements[0] {
            *value = text.clone();
        }
        notes::write_note(&directory, &backups, &id, "Benchmark", &document).unwrap();
        let path = notes::note_path(&directory, &id);
        let generation = REGISTRY.lock().unwrap().generation;
        let mut samples = [Vec::new(), Vec::new(), Vec::new()];
        for round in 0..ROUNDS {
            // Rotate modes to reduce systematic order/thermal bias.
            for step in 0..3 {
                let mode = (round + step) % 3;
                // Warm the filesystem before each sample; "cold" means application cache only.
                let prepared = source(&directory, &id, generation).unwrap();
                assert_eq!(prepared.text, text);
                assert_eq!(prepared.characters, characters);
                let mut elapsed = Duration::ZERO;
                for _ in 0..ITERATIONS {
                    if mode == 1 {
                        REGISTRY.lock().unwrap().sources.remove(&path);
                    }
                    let started = Instant::now();
                    if mode == 0 {
                        // Equivalent pre-cache work: authorization checks, read/decode,
                        // validation, text assembly, and manifest character count.
                        notes::validate_note_id(&id).unwrap();
                        assert!(!fs::symlink_metadata(&path)
                            .unwrap()
                            .file_type()
                            .is_symlink());
                        let note = notes::note_from_path(&path).unwrap();
                        let contents = tools::text(&note);
                        black_box(contents.chars().count());
                        black_box(contents);
                    } else {
                        black_box(source(&directory, &id, generation).unwrap());
                    }
                    elapsed += started.elapsed();
                }
                samples[mode].push(elapsed.as_secs_f64() * 1_000_000.0 / ITERATIONS as f64);
            }
        }
        let medians: Vec<f64> = samples
            .iter_mut()
            .map(|values| {
                values.sort_by(f64::total_cmp);
                values[ROUNDS / 2]
            })
            .collect();
        println!(
            "{}",
            json!({
                "fixtureTextBytes":text.len(), "fixtureFileBytes":fs::metadata(&path).unwrap().len(),
                "iterationsPerRound":ITERATIONS,"rounds":ROUNDS,
                "baselineMedianUs":medians[0],"coldCacheMedianUs":medians[1],"warmCacheMedianUs":medians[2],
                "baselineOverWarm":medians[0] / medians[2],
                "profile":if cfg!(debug_assertions) { "debug" } else { "optimized" },
                "scope":"source-preparation-only","filesystemCache":"warm"
            })
        );
    }
    clear();
}
