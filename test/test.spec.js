var expect = require("chai").expect;

var parser = new require("@tjc-group/odata-v2-parser");

var mysql = require("../build/lib/index");

describe("SQL Visitor", () => {
    var ast = parser.query("$filter=SystemID eq 'D60' and startswith(Description, 'Sys')&$select=SystemID,Description");

    it("should produce where condition as '\`SystemID\` = ? AND \`Description\` like ?'", function () {
        var query = mysql.createQuery(ast);
        expect(query.where).to.equal("`SystemID` = ? AND `Description` like ?");
    });

    it("should produce where condition with identifiers qualified with alias: '\`alias_1\`.\`SystemID\` = ? AND \`alias_1\`.\`Description\` like ?'", function () {
        var query = mysql.createQuery(ast, {alias: "alias_1"});
        expect(query.where).to.equal("`alias_1`.`SystemID` = ? AND `alias_1`.`Description` like ?");
    });

    it("should produce select and where with identifiers qualified with alias: '\`alias_1\`.\`SystemID\` = ? AND \`alias_1\`.\`Description\` like ?'", function () {
        var query = mysql.createQuery(ast, { alias: "alias_1" });
        expect(query.select).to.equal("`alias_1`.`SystemID`, `alias_1`.`Description`");
    });

    it("should generate SQL select without alias: '\`alias_1\`", function () {
        var query = mysql.createQuery(ast);
        var sql = query.from("peps.Systems");
        expect(sql).to.equal("SELECT `SystemID`, `Description` FROM `peps.Systems` WHERE `SystemID` = ? AND `Description` like ? ORDER BY 1");
    });
    
    it("should generate SQL select with alias: '\`alias_1\`", function () {
        var query = mysql.createQuery(ast, { alias: "alias_1" });
        var sql = query.from("peps.Systems");
        expect(sql).to.equal("SELECT `alias_1`.`SystemID`, `alias_1`.`Description` FROM `peps.Systems` AS `alias_1` WHERE `alias_1`.`SystemID` = ? AND `alias_1`.`Description` like ? ORDER BY 1");
    });
});