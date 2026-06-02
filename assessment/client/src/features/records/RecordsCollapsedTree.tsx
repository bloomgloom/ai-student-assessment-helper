interface RecordsCollapsedTreeClass {
  id: number;
  year: number;
  semester: number;
  grade: number;
  subject: string;
  room: string;
  scoring_filename: string;
  comments_filename: string;
}

interface RecordsCollapsedTreeProps {
  classes: RecordsCollapsedTreeClass[];
  selectedClassId?: number;
  getNodeOpen: (path: string) => boolean;
  onToggleOpen: (path: string) => void;
  onSelectClass: (item: RecordsCollapsedTreeClass) => void;
}

type SubGroup = { grade: number; subject: string; items: RecordsCollapsedTreeClass[] };
type GradeGroup = { grade: number; subs: SubGroup[] };
type YSGroup = { year: number; semester: number; gradeGroups: GradeGroup[] };

function roomIconLabel(room: string) {
  const match = room.match(/\d+/);
  return match ? match[0] : room.slice(0, 1);
}

function formatClassLabel(c: RecordsCollapsedTreeClass) {
  return `${c.year}학년도 ${c.semester}학기 ${c.grade}학년 ${c.subject} ${c.room}`;
}

function sortClassesForCollapsedTree(items: RecordsCollapsedTreeClass[]) {
  return [...items].sort((a, b) =>
    a.year - b.year ||
    a.semester - b.semester ||
    a.grade - b.grade ||
    a.subject.localeCompare(b.subject, 'ko') ||
    roomIconLabel(a.room).localeCompare(roomIconLabel(b.room), 'ko', { numeric: true })
  );
}

function groupClasses(items: RecordsCollapsedTreeClass[]) {
  const groups: YSGroup[] = [];
  for (const c of sortClassesForCollapsedTree(items)) {
    let ysg = groups.find(g => g.year === c.year && g.semester === c.semester);
    if (!ysg) {
      ysg = { year: c.year, semester: c.semester, gradeGroups: [] };
      groups.push(ysg);
    }

    let gg = ysg.gradeGroups.find(g => g.grade === c.grade);
    if (!gg) {
      gg = { grade: c.grade, subs: [] };
      ysg.gradeGroups.push(gg);
    }

    let sg = gg.subs.find(s => s.subject === c.subject);
    if (!sg) {
      sg = { grade: c.grade, subject: c.subject, items: [] };
      gg.subs.push(sg);
    }
    sg.items.push(c);
  }
  return groups;
}

export function RecordsCollapsedTree({
  classes,
  selectedClassId,
  getNodeOpen,
  onToggleOpen,
  onSelectClass,
}: RecordsCollapsedTreeProps) {
  const groups = groupClasses(classes);
  const box = 'relative flex h-8 w-8 items-center justify-center rounded text-xs font-bold shadow-sm select-none transition-opacity';
  const collapsedDot = <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-orange-400 border border-white z-10" />;

  return (
    <div className="flex-1 overflow-auto scrollbar-stable py-2 px-2">
      <div className="flex flex-col items-center gap-0.5 py-1">
        {groups.map(ysg => {
          const ysKey = `y${ysg.year}s${ysg.semester}`;
          const yKey = `y${ysg.year}`;
          const ysOpen = getNodeOpen(ysKey);
          const yOpen = getNodeOpen(yKey);

          return (
            <div key={`${ysg.year}-${ysg.semester}`} className="flex flex-col items-center gap-0.5">
              <button
                type="button"
                className={`${box} bg-slate-600 text-white cursor-pointer hover:bg-slate-500 ${!yOpen ? 'opacity-50' : ''}`}
                onClick={() => onToggleOpen(yKey)}
                title={yOpen ? `${ysg.year}학년도 접기` : `${ysg.year}학년도 펼치기`}
              >
                {String(ysg.year).slice(-2)}
                {!yOpen && collapsedDot}
              </button>
              <button
                type="button"
                className={`${box} ${ysg.semester === 1 ? 'bg-sky-200 text-sky-800 hover:bg-sky-300' : 'bg-amber-200 text-amber-800 hover:bg-amber-300'} cursor-pointer ${!ysOpen ? 'opacity-50' : ''}`}
                onClick={() => onToggleOpen(ysKey)}
                title={ysOpen ? `${ysg.semester}학기 접기` : `${ysg.semester}학기 펼치기`}
              >
                {ysg.semester === 1 ? '전' : '후'}
                {!ysOpen && collapsedDot}
              </button>

              {yOpen && ysOpen && (
                <>
                  <div className="h-px w-8 bg-gray-300 my-0.5" />
                  {ysg.gradeGroups.map((gg, gi) => {
                    const gKey = `y${ysg.year}s${ysg.semester}g${gg.grade}`;
                    const gOpen = getNodeOpen(gKey);
                    return (
                      <div key={gg.grade} className="flex flex-col items-center gap-0.5">
                        <button
                          type="button"
                          className={`${box} bg-gray-900 text-white cursor-pointer hover:bg-gray-700 ${!gOpen ? 'opacity-50' : ''}`}
                          onClick={() => onToggleOpen(gKey)}
                          title={gOpen ? `${gg.grade}학년 접기` : `${gg.grade}학년 펼치기`}
                        >
                          {gg.grade}
                          {!gOpen && collapsedDot}
                        </button>

                        {gOpen && gg.subs.map((sg, si) => {
                          const subKey = `y${ysg.year}s${ysg.semester}g${sg.grade}_${sg.subject}`;
                          const subOpen = getNodeOpen(subKey);
                          return (
                            <div key={sg.subject} className="flex flex-col items-center gap-0.5">
                              <button
                                type="button"
                                className={`${box} bg-gray-500 text-white cursor-pointer hover:bg-gray-400 ${!subOpen ? 'opacity-50' : ''}`}
                                onClick={() => onToggleOpen(subKey)}
                                title={subOpen ? `${sg.subject} 접기` : `${sg.subject} 펼치기`}
                              >
                                {sg.subject.slice(0, 1)}
                                {!subOpen && collapsedDot}
                              </button>

                              {subOpen && sg.items.map(c => (
                                <button
                                  key={c.id}
                                  type="button"
                                  className={`flex h-8 w-8 items-center justify-center rounded border text-xs font-bold transition-colors ${selectedClassId === c.id
                                    ? 'border-blue-400 bg-blue-600 text-white shadow-sm'
                                    : 'border-gray-200 bg-white text-gray-700 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700'
                                    }`}
                                  onClick={() => onSelectClass(c)}
                                  title={formatClassLabel(c)}
                                >
                                  {roomIconLabel(c.room)}
                                </button>
                              ))}
                              {si < gg.subs.length - 1 && subOpen && (
                                <div className="h-px w-8 bg-gray-100 my-0.5" />
                              )}
                            </div>
                          );
                        })}
                        {gi < ysg.gradeGroups.length - 1 && gOpen && (
                          <div className="h-px w-8 bg-gray-200 my-0.5" />
                        )}
                      </div>
                    );
                  })}
                </>
              )}
              <div className="h-px w-8 bg-gray-300 my-1" />
            </div>
          );
        })}
        {classes.length === 0 && (
          <div className="py-6 text-center text-xs text-gray-400">없음</div>
        )}
      </div>
    </div>
  );
}
