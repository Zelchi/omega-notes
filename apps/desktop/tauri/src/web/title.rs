use html5ever::tendril::StrTendril;
use html5ever::tokenizer::{
    states::RawKind, BufferQueue, TagKind, Token, TokenSink, TokenSinkResult, Tokenizer,
    TokenizerOpts,
};
use std::cell::{Cell, RefCell};

#[derive(Default)]
struct TitleSink {
    active: Cell<bool>,
    done: Cell<bool>,
    title: RefCell<String>,
}

impl TokenSink for TitleSink {
    type Handle = ();
    fn process_token(&self, token: Token, _: u64) -> TokenSinkResult<()> {
        match token {
            Token::TagToken(tag) if tag.kind == TagKind::StartTag && !self.done.get() => {
                match tag.name.as_ref() {
                    "title" => {
                        self.active.set(true);
                        return TokenSinkResult::RawData(RawKind::Rcdata);
                    }
                    "script" => return TokenSinkResult::RawData(RawKind::ScriptData),
                    "style" => return TokenSinkResult::RawData(RawKind::Rawtext),
                    _ => {}
                }
            }
            Token::TagToken(tag) if tag.kind == TagKind::EndTag && tag.name.as_ref() == "title" => {
                self.active.set(false);
                self.done.set(true);
            }
            Token::CharacterTokens(value)
                if self.active.get() && self.title.borrow().len() < 4096 =>
            {
                self.title.borrow_mut().push_str(&value);
            }
            _ => {}
        }
        TokenSinkResult::Continue
    }
}

pub(super) fn extract_title(html: &str) -> Option<String> {
    let tokenizer = Tokenizer::new(TitleSink::default(), TokenizerOpts::default());
    let input = BufferQueue::default();
    input.push_back(StrTendril::from_slice(html));
    let _ = tokenizer.feed(&input);
    tokenizer.end();
    let title = tokenizer
        .sink
        .title
        .borrow()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");
    if title.is_empty() || title.contains('\u{fffd}') {
        return None;
    }
    Some(title.chars().take(300).collect())
}
