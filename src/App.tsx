import { useState } from 'react'
import { Copy, Check } from 'lucide-react';

export default function SqlToJavaConverter() {
  const [sql, setSql] = useState('');
  const [javaCode, setJavaCode] = useState('');
  const [copied, setCopied] = useState(false);
  const [options, setOptions] = useState({
    lombok: true,
    jpa: true,
    jackson: true,
    generateGettersSetters: true
  });

  const sqlTypeToJavaType = (sqlType: string) => {
    const type = sqlType.toUpperCase();
    
    if (type.includes('VARCHAR') || type.includes('TEXT') || type.includes('CHAR')) return 'String';
    if (type.includes('INT')) return 'Integer';
    if (type.includes('BIGINT')) return 'Long';
    if (type.includes('SMALLINT')) return 'Short';
    if (type.includes('TINYINT')) return 'Byte';
    if (type.includes('DECIMAL') || type.includes('NUMERIC')) return 'BigDecimal';
    if (type.includes('FLOAT')) return 'Float';
    if (type.includes('DOUBLE')) return 'Double';
    if (type.includes('BOOLEAN') || type.includes('BOOL') || type.includes('BIT')) return 'Boolean';
    if (type.includes('DATE')) return 'LocalDate';
    if (type.includes('TIMESTAMP') || type.includes('DATETIME')) return 'LocalDateTime';
    if (type.includes('TIME')) return 'LocalTime';
    if (type.includes('BLOB')) return 'byte[]';
    
    return 'String';
  };

  const snakeToCamel = (str: string) => {
    return str.toLowerCase().replace(/_([a-z])/g, (match, letter) => letter.toUpperCase());
  };

  const snakeToPascal = (str: any) => {
    const camel = snakeToCamel(str);
    return camel.charAt(0).toUpperCase() + camel.slice(1);
  };

  const parseCreateTable = (sql: string) => {
    const tableMatch = sql.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?`?(\w+)`?/i);
    if (!tableMatch) return null;

    const tableName = tableMatch[1];
    const className = snakeToPascal(tableName);

    const columnRegex = /`?(\w+)`?\s+([\w\(\)]+)(?:\s+(NOT\s+NULL|NULL|PRIMARY\s+KEY|AUTO_INCREMENT|UNIQUE))*[,\)]/gi;
    const columns = [];
    let match;

    while ((match = columnRegex.exec(sql)) !== null) {
      const columnName = match[1];
      const sqlType = match[2];
      const constraints = match[3] || '';

      if (columnName.toUpperCase() === 'PRIMARY' || columnName.toUpperCase() === 'FOREIGN' || 
          columnName.toUpperCase() === 'KEY' || columnName.toUpperCase() === 'CONSTRAINT') {
        continue;
      }

      columns.push({
        name: columnName,
        javaName: snakeToCamel(columnName),
        type: sqlTypeToJavaType(sqlType),
        isPrimaryKey: constraints.toUpperCase().includes('PRIMARY KEY') || sql.match(new RegExp(`PRIMARY\\s+KEY\\s*\\(\\s*\`?${columnName}\`?\\s*\\)`, 'i')),
        isAutoIncrement: constraints.toUpperCase().includes('AUTO_INCREMENT'),
        isNullable: !constraints.toUpperCase().includes('NOT NULL') && !constraints.toUpperCase().includes('PRIMARY KEY')
      });
    }

    return { tableName, className, columns };
  };

  const generateJavaClass = (tableInfo: { tableName: any; className: any; columns: any; }) => {
    if (!tableInfo) return '';

    const { tableName, className, columns } = tableInfo;
    const imports = new Set(['javax.persistence.*']);

    if (options.lombok) {
      imports.add('lombok.Data');
      imports.add('lombok.NoArgsConstructor');
      imports.add('lombok.AllArgsConstructor');
    }

    if (options.jackson) {
      imports.add('com.fasterxml.jackson.annotation.JsonProperty');
    }

    const needsLocalDate = columns.some((c: { type: string; }) => c.type === 'LocalDate');
    const needsLocalDateTime = columns.some((c: { type: string; }) => c.type === 'LocalDateTime');
    const needsLocalTime = columns.some((c: { type: string; }) => c.type === 'LocalTime');
    const needsBigDecimal = columns.some((c: { type: string; }) => c.type === 'BigDecimal');

    if (needsLocalDate || needsLocalDateTime || needsLocalTime) {
      if (needsLocalDate) imports.add('java.time.LocalDate');
      if (needsLocalDateTime) imports.add('java.time.LocalDateTime');
      if (needsLocalTime) imports.add('java.time.LocalTime');
    }
    if (needsBigDecimal) imports.add('java.math.BigDecimal');

    let code = Array.from(imports).sort().map(imp => `import ${imp};`).join('\n');
    code += '\n\n';

    if (options.jpa) {
      code += `@Entity\n`;
      code += `@Table(name = "${tableName}")\n`;
    }

    if (options.lombok) {
      code += `@Data\n`;
      code += `@NoArgsConstructor\n`;
      code += `@AllArgsConstructor\n`;
    }

    code += `public class ${className} {\n\n`;

    columns.forEach((col: { isPrimaryKey: any; isAutoIncrement: any; name: any; javaName: any; isNullable: any; type: any; }, idx: number) => {
      if (col.isPrimaryKey && options.jpa) {
        code += `    @Id\n`;
        if (col.isAutoIncrement) {
          code += `    @GeneratedValue(strategy = GenerationType.IDENTITY)\n`;
        }
      }
      
      if (options.jpa && col.name !== col.javaName) {
        code += `    @Column(name = "${col.name}"`;
        if (!col.isNullable) code += `, nullable = false`;
        code += `)\n`;
      }
      
      if (options.jackson && col.name !== col.javaName) {
        code += `    @JsonProperty("${col.name}")\n`;
      }

      code += `    private ${col.type} ${col.javaName};\n`;
      if (idx < columns.length - 1) code += '\n';
    });

    if (options.generateGettersSetters && !options.lombok) {
      code += '\n';
      columns.forEach((col: { javaName: string; type: any; }) => {
        const capitalizedName = col.javaName.charAt(0).toUpperCase() + col.javaName.slice(1);
        code += `\n    public ${col.type} get${capitalizedName}() {\n`;
        code += `        return ${col.javaName};\n`;
        code += `    }\n`;
        code += `\n    public void set${capitalizedName}(${col.type} ${col.javaName}) {\n`;
        code += `        this.${col.javaName} = ${col.javaName};\n`;
        code += `    }\n`;
      });
    }

    code += '}\n';
    return code;
  };

  const handleConvert = () => {
    const tableInfo = parseCreateTable(sql);
    if (tableInfo) {
      const code = generateJavaClass(tableInfo);
      setJavaCode(code);
    } else {
      setJavaCode('// Erro: Não foi possível parsear o SQL. Verifique a sintaxe.');
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(javaCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const exampleSql = `CREATE TABLE user_account (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    user_name VARCHAR(100) NOT NULL,
    email VARCHAR(255) NOT NULL,
    created_at TIMESTAMP,
    is_active BOOLEAN DEFAULT true,
    balance DECIMAL(10,2)
);`;

  return (
    <div className="min-h-screen bg-white p-8">
      <div className="max-w-6xl mx-auto">
        <div className="mb-12">
          <h1 className="text-4xl font-normal text-gray-900 mb-2">Oxpecker</h1>
          <p className="text-gray-600">Paste your CREATE TABLE and receive the ready-made Java model</p>
        </div>

        <div className="mb-8">
          <h3 className="text-lg font-normal text-gray-900 mb-4">Opções:</h3>
          <div className="flex flex-wrap gap-6">
            <label className="flex items-center gap-2 text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={options.lombok}
                onChange={(e) => setOptions({...options, lombok: e.target.checked})}
                className="w-4 h-4"
              />
              <span>Lombok (@Data)</span>
            </label>
            <label className="flex items-center gap-2 text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={options.jpa}
                onChange={(e) => setOptions({...options, jpa: e.target.checked})}
                className="w-4 h-4"
              />
              <span>JPA Annotations</span>
            </label>
            <label className="flex items-center gap-2 text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={options.jackson}
                onChange={(e) => setOptions({...options, jackson: e.target.checked})}
                className="w-4 h-4"
              />
              <span>Jackson</span>
            </label>
            <label className="flex items-center gap-2 text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={options.generateGettersSetters}
                onChange={(e) => setOptions({...options, generateGettersSetters: e.target.checked})}
                disabled={options.lombok}
                className="w-4 h-4 disabled:opacity-50"
              />
              <span className={options.lombok ? 'opacity-50' : ''}>Getters/Setters</span>
            </label>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-8 mb-8">
          <div>
            <div className="flex justify-between items-center mb-3">
              <h2 className="text-xl font-normal text-gray-900">SQL Input</h2>
              <button
                onClick={() => setSql(exampleSql)}
                className="text-sm text-blue-600 hover:underline"
              >
                exemple
              </button>
            </div>
            <textarea
              value={sql}
              onChange={(e) => setSql(e.target.value)}
              placeholder="CREATE TABLE ..."
              className="w-full h-96 bg-gray-50 text-gray-900 font-mono text-sm p-4 border border-gray-300 rounded focus:outline-none focus:border-gray-400 resize-none"
            />
          </div>

          <div>
            <div className="flex justify-between items-center mb-3">
              <h2 className="text-xl font-normal text-gray-900">Java Model</h2>
              {javaCode && (
                <button onClick={handleCopy} className="flex items-center gap-2 text-sm text-blue-600 hover:underline">
                  {copied ? (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      <span>Copy</span>
                    </>
                  )}
                </button>
              )}
            </div>
            <textarea
              value={javaCode}
              readOnly
              placeholder="// Java code will appear here..."
              className="w-full h-96 bg-gray-50 text-gray-900 font-mono text-sm p-4 border border-gray-300 rounded resize-none"
            />
          </div>
        </div>

        <div className="flex justify-center">
          <button
            onClick={handleConvert}
            disabled={!sql.trim()}
            className="px-6 py-2 bg-gray-900 text-white hover:bg-gray-800 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
          >
            Convert
          </button>
        </div>

        <div className="mt-16 pt-8 border-t border-gray-200">
          <p className="text-sm text-gray-500">
            Supported data types: VARCHAR, INT, BIGINT, DECIMAL, BOOLEAN, TIMESTAMP, DATE, and more
          </p>
        </div>
      </div>
    </div>
  );
}