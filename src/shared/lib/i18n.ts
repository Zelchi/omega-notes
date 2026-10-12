import en from "../../../lang/en.json";
import ptBr from "../../../lang/pt-br.json";

export type Language = "pt-br" | "en";
export type TranslationKey = keyof typeof ptBr;

type Dictionary = Record<TranslationKey, string>;

const dictionaries: Record<Language, Dictionary> = {
	"pt-br": ptBr,
	en: en,
};

export const translate = (language: Language, key: TranslationKey): string => {
	return dictionaries[language][key];
};
