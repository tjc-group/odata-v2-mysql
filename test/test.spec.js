const expect = require("chai").expect;

var parser = new require("@tjc-group/odata-v2-parser");

var mysql = require("../build/lib/index");

describe("SQL Visitor", () => {
    var ast = parser.query("$format=json&$filter=(SystemID eq 'D60' and startswith(Description, 'Sys')) or UUID eq null&$select=SystemID,Description");

    it("should produce where condition as '\`SystemID\` = ? AND \`Description\` like ?'", function () {
        var query = mysql.createQuery(ast);
        expect(query.where).to.equal("(`SystemID` = ? AND `Description` like ?) OR `UUID` IS NULL");
    });

    it("should produce where condition with identifiers qualified with alias: 'alias_1.\`SystemID\` = ? AND alias_1.\`Description\` like ?'", function () {
        var query = mysql.createQuery(ast, {alias: "alias_1"});
        expect(query.where).to.equal("(alias_1.`SystemID` = ? AND alias_1.`Description` like ?) OR alias_1.`UUID` IS NULL");
    });

    it("should produce select and where with identifiers qualified with alias: 'alias_1.\`SystemID\` = ? AND alias_1.\`Description\` like ?'", function () {
        var query = mysql.createQuery(ast, { alias: "alias_1" });
        expect(query.select).to.equal("alias_1.`SystemID`, alias_1.`Description`");
    });

    it("should generate SQL select without alias: '\`alias_1\`", function () {
        var query = mysql.createQuery(ast);
        var sql = query.from("peps.Systems");
        expect(sql).to.equal("SELECT `SystemID`, `Description` FROM `peps.Systems` WHERE (`SystemID` = ? AND `Description` like ?) OR `UUID` IS NULL ORDER BY 1");
    });

    it("should generate SQL select with alias: '\`alias_1\`", function () {
        var query = mysql.createQuery(ast, { alias: "alias_1" });
        var sql = query.from("peps.Systems");
        expect(sql).to.equal("SELECT alias_1.`SystemID`, alias_1.`Description` FROM `peps.Systems` AS alias_1 WHERE (alias_1.`SystemID` = ? AND alias_1.`Description` like ?) OR alias_1.`UUID` IS NULL ORDER BY 1");
    });
    it("should generate SQL select with alias and empty filter: '\`alias_1\`", function () {
        var query = mysql.createQuery("$inlinecount=allpages", { alias: "alias_1" });
        var sql = query.from("peps.Systems");
        expect(sql).to.equal("SELECT * FROM `peps.Systems` AS alias_1 WHERE 1 = 1 ORDER BY 1");
    });
});