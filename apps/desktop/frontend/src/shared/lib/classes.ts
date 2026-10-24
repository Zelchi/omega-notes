export const cx = (...classNames: Array<string | false | null | undefined>): string => {
	return classNames.filter((className): className is string => Boolean(className)).join(" ");
};
