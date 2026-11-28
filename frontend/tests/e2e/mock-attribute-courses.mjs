// Shared synthetic courses so attribute browsing and the planner use the same IDs and times.
export const attributeCourses = ["Social Sciences I", "Social Sciences II", "Science", "both"].map((attribute,index)=>({
  id:`30000000-0000-4000-8000-${String(index).padStart(12,"0")}`, code:`SOCI ${200+index}`, name:`Social elective ${index+1}`,
  description:"A synthetic elective about people and society.", credits:3, department:attribute === "Science" ? "Science" : "Social Sciences", prerequisites:"",
  attributes:attribute === "both" ? ["Social Sciences I","Social Sciences II"] : [attribute],
}));
export const attributeSections = course => [{
  crn:`80${attributeCourses.indexOf(course)}01`,section:"1",title:course.name,credits:3,
  instructors:["Spring Instructor"],attributes:course.attributes,prerequisites:null,connected_crns:[],campus:"Beirut",details_url:null,source_updated_at:null,restrictions:null,
  sessions:[{days:"MW",start:"09:00",end:"10:15",type:"Lecture",location:"Test Hall",instructor:"Spring Instructor"}],
}];
