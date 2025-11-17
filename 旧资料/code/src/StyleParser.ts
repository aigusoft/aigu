import { mkScopedExpr, mkScopedValue } from "./Utils";
import { WcLog } from "./Logger";
const log = WcLog(module);

/**
 * CSS 解析规则:
 *  1. @ 规则
 *  2. RULE 规则
 *  >  '@' 规则可以 嵌套其他的 '@' 规则以及RULE规则
 *  >  RULE 规则可以嵌套其他的 RULE 规则
 */

export interface IStyleInfo {
	[k: string]: {
		styleName: string;
		text: string;
		binderFuncs: Function[];
	};
}

export interface IParsedCSS {
	[k: string]: {
		text: string;
		rules?: IStyleInfo;
	};
}

/**
 * 解析 css style 文本, 生成 css 数据绑定信息
 * 替换 模板绑定ID
 * 不处理 @ 开头的rule，仅支持标准rule绑定信息
 */
export class _StyleParser {
	constructor() {}
	private _stylesTidMap = new Map<number, IParsedCSS>();

	_getParsedCss(tid: number) {
		return this._stylesTidMap.get(tid);
	}

	/**
	 * 查找闭合 {},切分每一条 Rule
	 * 如果是@规则，则查找闭合{}或者到达;号
	 * @TODO 修改为正则表达式实现
	 * @param cssText
	 */
	private _splitRulesText(cssText: string) {
		let pos = 0;
		let count = 0;
		const rules = [] as string[];

		for (let i = 0; i < cssText.length; i++) {
			if (cssText[i] === "{") count++;
			else if (cssText[i] === "}") {
				count--;
				if (count === 0) {
					rules.push(cssText.substring(pos, i + 1).trim());
					pos = i + 1;
				}
			} else if (cssText[i] === ";" && count === 0) {
				// 处理简化的@规则
				rules.push(cssText.substring(pos, i + 1).trim());
				pos = i + 1;
			}
		}
		return rules;
	}

	private _parseStyles(stylesText: string) {
		const styles: IStyleInfo = {};
		stylesText.split(";").forEach((item) => {
			const pos = item.indexOf(":");
			const styleName = item.substr(0, pos).trim();
			const styleValue = item.substr(pos + 1).trim();

			// const matched = styleValue.match(/^"[$:].+?"/g) || styleValue.match(/^'[$:].+?'/g);
			// if (styleValue.match(/\.jpg/)) debugger;
			const matched = styleValue.match(/(("[$:].+?")|('[$:].+?'))/g);

			const binderFuncs: Function[] = [];
			// if (styleName == 'width') debugger;
			if (matched) {
				matched.forEach((matchStr) => {
					// log.log('----!!!!__parseStyles,str=', str);
					// 去除首尾的 ' 或 ""
					const str = matchStr.substr(1, matchStr.length - 2);
					try {
						if (str.startsWith("$")) {
							binderFuncs.push(mkScopedValue(str.substr(1)));
						} else if (str.startsWith(":")) {
							binderFuncs.push(mkScopedExpr(str.substr(1)));
						}
					} catch (e: any) {
						log.error("parse style failed:", str, stylesText, e.message);
					}
				});
			}

			// 处理binds??
			// if (styleName && styleValue) styles[kebabToSnake(styleName)] = { styleName, text: styleValue, binderFuncs };
			if (styleName && styleValue) styles[styleName] = { styleName, text: styleValue, binderFuncs };
		});
		return styles;
	}

	// BUFFIX: 火狐浏览器必须去除回车换行后解析!!
	private _parseRuleText(ruleTextList: string[]) {
		const rules = {} as any;
		ruleTextList.forEach((ruleText) => {
			// 解析
			const str = ruleText.replace(/[\n\r]/g, "").trim();
			if (str.startsWith("@")) {
        //@key 可能有重复
        rules[str] = str;
			} else {
				// 处理@规则, @规则不处理绑定信息
				const match = str.match(/^(.*?){(.*)}$/);

				if (match?.length === 3) {
					const ruleName = match[1].trim();
					rules[ruleName] = match[2].trim();
				}
			}
		});
		return rules;
	}
	_parseTpl(tplEl: HTMLStyleElement) {
		// debugger;
		const tid = parseInt(tplEl.getAttribute("tid")!);
		// log.log("----- StyleParser", tid, tplEl);
		// debugger;
		const parsed = {} as IParsedCSS;
		//  删除注释和回车换行
		let cssText = tplEl.textContent!.replace(/\/\*([\s\S]*?)\*\/|\n/g, "");
		// 切分规则
		const textRules = this._splitRulesText(cssText);
		// log.log('----- textRules', textRules);
		const styleRules = this._parseRuleText(textRules);
		// log.log('----- styleRules', styleRules);
		// 检测rule是否包含模板数据
		Object.keys(styleRules).forEach((ruleName) => {
			// if (ruleName == ".btn") debugger;
			const ruleInfo: IParsedCSS[keyof IParsedCSS] = {
				text: styleRules[ruleName],
				rules: ruleName.startsWith("@") ? undefined : this._parseStyles(styleRules[ruleName]),
			};
			parsed[ruleName] = ruleInfo;
		});

		this._stylesTidMap.set(tid, parsed);
		// log.debug("parsed styles:", tid, Object.keys(parsed));
	}
	/**
	 * 映射表附加实际的style表ITEM
	 * @param styleEl
	 */
	_attachStyleElement(root: ShadowRoot, parsedCss: IParsedCSS) {
		for (let i = 0; i < root.styleSheets.length; i++) {
			let sheet = root.styleSheets.item(i);
			sheet?.ownerNode;
		}
	}
}
