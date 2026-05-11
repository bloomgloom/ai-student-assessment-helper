import { CriteriaStandardRow } from './types';

interface CriteriaContentProps {
  selected: boolean;
  standards: CriteriaStandardRow[];
}

function buildRowSpans(standards: CriteriaStandardRow[]) {
  const result: Record<number, number> = {};
  let currentContent = '';
  let startIndex = -1;
  let count = 0;

  standards.forEach((row, i) => {
    if (row.content !== currentContent) {
      if (startIndex !== -1) {
        result[startIndex] = count;
      }
      currentContent = row.content;
      startIndex = i;
      count = 1;
    } else {
      count++;
      result[i] = 0;
    }
  });
  if (startIndex !== -1) {
    result[startIndex] = count;
  }
  return result;
}

function CriteriaStandardsTable({ standards }: Pick<CriteriaContentProps, 'standards'>) {
  const spans = buildRowSpans(standards);

  return (
    <div className="flex-1 min-h-0 overflow-auto scrollbar-stable p-6">
      <div className="min-w-[760px] bg-white border border-gray-200 rounded-md overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500">
            <tr>
              <th className="text-center px-4 py-2 font-medium w-32">코드</th>
              <th className="text-left px-4 py-2 font-medium w-[35%]">성취기준</th>
              <th className="text-center px-3 py-2 font-medium w-16">수준</th>
              <th className="text-left px-4 py-2 font-medium">성취수준</th>
            </tr>
          </thead>
          <tbody>
            {standards.map((row, i) => {
              const span = spans[i];
              return (
                <tr key={row.id} className="border-t border-gray-100 align-top">
                  {span > 0 && (
                    <td rowSpan={span} className="px-2 py-2 font-mono text-xs text-blue-600 text-center border-r border-gray-100 align-middle">
                      {row.code}
                    </td>
                  )}
                  {span > 0 && (
                    <td rowSpan={span} className="px-4 py-2 text-gray-700 border-r border-gray-100 align-middle">
                      {row.content.replace(row.code, '').trim()}
                    </td>
                  )}
                  <td className="px-3 py-2 text-center font-bold text-gray-700 border-r border-gray-100">{row.level}</td>
                  <td className="px-4 py-2 text-gray-700 leading-relaxed">{row.description}</td>
                </tr>
              );
            })}
            {standards.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-400">데이터가 없습니다.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function CriteriaContent({ selected, standards }: CriteriaContentProps) {
  if (!selected) {
    return <div className="h-full flex items-center justify-center text-gray-400 text-sm">왼쪽에서 영역을 선택하세요</div>;
  }

  return <CriteriaStandardsTable standards={standards} />;
}
