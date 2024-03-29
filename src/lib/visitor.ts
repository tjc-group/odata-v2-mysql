/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { Token } from "@tjc-group/odata-v2-parser/lib/lexer";
// import { Literal as ODataLiteral } from "odata-v4-literal";
import { Literal } from "odata-v4-literal";
import { SQLLiteral as ODataSQLLiteral, SQLLang, Visitor } from "odata-v4-sql/lib/visitor";
import { SqlOptions } from "./index";

const binaryMask = /^(binary|X)'([0-9a-fA-F]*)'/;

// class Literal extends ODataLiteral {
// 	static convert(type: string, value: string): any {
// 		return (new Literal(type, value)).valueOf();
// 	}
// 	'Edm.Binary'(value: string): any {
// 		if (binaryMask.test(value)) {
// 			return Buffer.from(value.match(binaryMask)[2], "hex");
// 		} else {
// 			return Buffer.from(value, "base64");
// 		}
// 	}
// }

class SQLLiteral extends ODataSQLLiteral {
	static convert(type: string, value: string): any {
		return (new SQLLiteral(type, value)).valueOf();
	}
	'Edm.Binary'(value: string): any {
		if (binaryMask.test(value)) {
			return "UNHEX('" + value.match(binaryMask)[2] + "')";
		} else {
			return "UNHEX('" + Buffer.from(value, "base64").toString("hex") + "')";
		}
	}
}

export class MySQLVisitor extends Visitor {
	parameters: any[] = [];
	includes: MySQLVisitor[] = [];
	format: string;

	constructor(options = <SqlOptions>{}) {
		super(options);
		(<any>this).parameters = [];
		this.type = SQLLang.MySql;
	}

	from(table: string): string {
		const alias = (<any>this.options).alias;
		let sql = alias ?
			`SELECT ${this.select} FROM \`${table}\` AS ${alias} WHERE ${this.where} ORDER BY ${this.orderby}` :
			`SELECT ${this.select} FROM \`${table}\` WHERE ${this.where} ORDER BY ${this.orderby}`;
		if (typeof this.limit == "number") sql += ` LIMIT ${this.limit}`;
		if (typeof this.skip == "number") sql += ` OFFSET ${this.skip}`;
		return sql;
	}

	protected VisitFormat(node: Token, context: any): void {
		this.format = node.value.format;
	}

	protected VisitExpand(node: Token, context: any): void {
		node.value.items.forEach((item) => {
			const expandPath = item.value.path.raw;
			let visitor = this.includes.filter(v => v.navigationProperty == expandPath)[0];
			if (!visitor) {
				visitor = new MySQLVisitor(this.options);
				visitor.parameterSeed = this.parameterSeed;
				this.includes.push(visitor);
			}
			visitor.Visit(item);
			this.parameterSeed = visitor.parameterSeed;
		});
	}

	protected VisitSelectItem(node: Token, context: any): void {
		const item = node.raw.replace(/\//g, '.');
		const alias = (<any>this.options).alias;
		this.select += alias ? `${alias}.\`${item}\`` : `\`${item}\``;
	}

	protected VisitODataIdentifier(node: Token, context: any): void {
		const alias = (<any>this.options).alias;
		this[context.target] += alias ? `${alias}.\`${node.value.name}\`` : `\`${node.value.name}\``;
		context.identifier = node.value.name;
	}

	protected VisitEqualsExpression(node: Token, context: any): void {
		this.Visit(node.value.left, context);
		this.where += " = ";
		this.Visit(node.value.right, context);
		const alias = (<any>this.options).alias;

		const identifierMask = alias ?
			new RegExp(`\\? = ${alias}.\\\`${context.identifier}\\\`$`) :
			new RegExp(`\\? = \\\`${context.identifier}\\\`$`);

		const replaceStr = alias ? `${alias}.\`${context.identifier}\`  IS NULL` : `\`${context.identifier}\` IS NULL`

		if (this.options.useParameters && context.literal == null) {
			this.where = this.where.replace(/= \?$/, "IS NULL").replace(identifierMask, replaceStr);
		} else if (context.literal == "NULL") {
			this.where = this.where.replace(/= NULL$/, "IS NULL").replace(identifierMask, replaceStr);
		}
	}

	protected VisitNotEqualsExpression(node: Token, context: any): void {
		this.Visit(node.value.left, context);
		this.where += " <> ";
		this.Visit(node.value.right, context);

		const alias = (<any>this.options).alias;
		const identifierMask = alias ?
			new RegExp(`\\? = ${alias}.\\\`${context.identifier}\\\`$`) :
			new RegExp(`\\? = \\\`${context.identifier}\\\`$`);

		const replaceStr = alias ? `${alias}.\`${context.identifier}\`  IS NULL` : `\`${context.identifier}\` IS NOT NULL`

		if (this.options.useParameters && context.literal == null) {
			this.where = this.where.replace(/<> \?$/, "IS NOT NULL").replace(identifierMask, replaceStr);
		} else if (context.literal == "NULL") {
			this.where = this.where.replace(/<> NULL$/, "IS NOT NULL").replace(identifierMask, replaceStr);
		}
	}

	protected VisitLiteral(node: Token, context: any): void {
		if (this.options.useParameters) {
			const value = Literal.convert(node.value, node.raw);
			context.literal = value;
			this.parameters.push(value);
			this.where += "?";
		} else this.where += (context.literal = SQLLiteral.convert(node.value, node.raw));
	}

	protected VisitMethodCallExpression(node: Token, context: any): void {
		const method = node.value.method;
		const params = node.value.parameters || [];
		switch (method) {
			case "contains":
				this.Visit(params[0], context);
				if (this.options.useParameters) {
					const value = Literal.convert(params[1].value, params[1].raw);
					this.parameters.push(`%${value}%`);
					this.where += " like ?";
				} else this.where += ` like '%${SQLLiteral.convert(params[1].value, params[1].raw).slice(1, -1)}%'`;
				break;
			case "endswith":
				this.Visit(params[0], context);
				if (this.options.useParameters) {
					const value = Literal.convert(params[1].value, params[1].raw);
					this.parameters.push(`%${value}`);
					this.where += " like ?";
				} else this.where += ` like '%${SQLLiteral.convert(params[1].value, params[1].raw).slice(1, -1)}'`;
				break;
			case "startswith":
				this.Visit(params[0], context);
				if (this.options.useParameters) {
					const value = Literal.convert(params[1].value, params[1].raw);
					this.parameters.push(`${value}%`);
					this.where += " like ?";
				} else this.where += ` like '${SQLLiteral.convert(params[1].value, params[1].raw).slice(1, -1)}%'`;
				break;
			case "substring":
				this.where += "SUBSTR(";
				this.Visit(params[0], context);
				this.where += ", ";
				this.Visit(params[1], context);
				this.where += " + 1";
				if (params[2]) {
					this.where += ", ";
					this.Visit(params[2], context);
				} else {
					this.where += ", CHAR_LENGTH(";
					this.Visit(params[0], context);
					this.where += ")";
				}
				this.where += ")";
				break;
			case "substringof":
				this.Visit(params[1], context);
				if (params[0].value == "Edm.String") {
					if (this.options.useParameters) {
						const value = Literal.convert(params[0].value, params[0].raw);
						this.parameters.push(`%${value}%`);
						this.where += " like ?";
						// this.where += ` like \$${this.parameters.length}`;
					} else this.where += ` like '%${SQLLiteral.convert(params[0].value, params[0].raw).slice(1, -1)}%'`;
				} else {
					this.where += " like ";
					this.Visit(params[0], context);
				}
				break;
			case "concat":
				this.where += "CONCAT(";
				this.Visit(params[0], context);
				this.where += ", ";
				this.Visit(params[1], context);
				this.where += ")";
				break;
			case "round":
				this.where += "ROUND(";
				this.Visit(params[0], context);
				this.where += ")";
				break;
			case "length":
				this.where += "CHAR_LENGTH(";
				this.Visit(params[0], context);
				this.where += ")";
				break;
			case "tolower":
				this.where += "LCASE(";
				this.Visit(params[0], context);
				this.where += ")";
				break;
			case "toupper":
				this.where += "UCASE(";
				this.Visit(params[0], context);
				this.where += ")";
				break;
			case "floor":
			case "ceiling":
			case "year":
			case "month":
			case "day":
			case "hour":
			case "minute":
			case "second":
				this.where += `${method.toUpperCase()}(`;
				this.Visit(params[0], context);
				this.where += ")";
				break;
			case "now":
				this.where += "NOW()";
				break;
			case "trim":
				this.where += "TRIM(BOTH ' ' FROM ";
				this.Visit(params[0], context);
				this.where += ")";
				break;
		}
	}

}
