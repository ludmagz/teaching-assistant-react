import { Class, CreateClassRequest } from '../types/Class';
import { DefineAverageCalculationSpecificationRequest } from '../types/AverageCalculationSpecification';
import { ReportData } from '../types/Report';
import { get, remove, sendJson } from './apiClient';

const CLASSES = '/api/classes';
export const classPath = (classId: string) => `${CLASSES}/${classId}`;

/** Access to the classes kept by the server. */
export const classService = {
  getAllClasses: (): Promise<Class[]> =>
    get(CLASSES, 'Failed to fetch classes'),

  addClass: (classData: CreateClassRequest): Promise<Class> =>
    sendJson('POST', CLASSES, classData, 'Failed to add class'),

  updateClass: (classId: string, classData: CreateClassRequest): Promise<Class> =>
    sendJson('PUT', classPath(classId), classData, 'Failed to update class'),

  deleteClass: (classId: string): Promise<void> =>
    remove(classPath(classId), 'Failed to delete class'),

  getClassReport: (classId: string): Promise<ReportData> =>
    get(`${classPath(classId)}/report`, 'Failed to fetch class report'),

  /** Defines how the averages of a class are computed; answers the updated class. */
  defineAverageCalculationSpecification: (
    classId: string,
    specification: DefineAverageCalculationSpecificationRequest
  ): Promise<Class> =>
    sendJson('PUT', `${classPath(classId)}/average-calculation-specification`, specification,
      'Failed to define the average calculation')
};
